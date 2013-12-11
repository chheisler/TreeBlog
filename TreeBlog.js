/*
	TODO:
		Orphaned clusters
		Better way of keeping things centered; use heaviest node instead of root?
		Can we get optimization to work? Other optimizations?
		Stroke width based on number of reblogs going through that path?
		Can we indicate direction of lines at all? Gradients?
		Will truncating really improve performance?
		Tweaking push and pull to keep nodes from being inside parent/adjust how mass is set relative to radius so it always pushes things outside of it? this will require ACTUAL MATH adjust radius to log of children count?
		Scale down nodes to fit more? Zooming?
		Showing parents and ancestors, information on node
		Click and drag?
		Scaling of line thickness, border thickness
		Adjust scaling of circles, keep largest around 32px(?), make logarithmic?
		Historical playback of reblogs in order they were made?
		Better initial placement of nodes
		Remove insertion on parsing notes, make separate
			will effect inserting lines and circles as well
			May want to store reblogs in list?
*/

//wrap variables and functions in object to namespace it
var TreeBlog = {
	request: new XMLHttpRequest(), //request for retrieving notes
	notes: [],
	
	//configuration options
	config: {
		width: 1000, //width of graph in pixels
		height: 1000, //height of graph in pixels
		damping: 0.8, //damping to make sure moving nodes eventually stop
		min_velocity: 1, //minimum total energy at which to consider tree balanced
		speed: 200, //speed of animations in milliseconds
		max_depth: 8,
		theta: 8,
		threshold: 1,
		color: {
			node: 'red',
			root: 'blue',
			highlight: 'orange',
			ancestor: 'green',
			descendant: 'purple',
		}
	},
	
	
	//initialization function
	init: function() {
		//if graph does note exist, build it, else display it
		if(!TreeBlog.graph) {
			this.graph = new TreeBlog.Graph(this.config.width, this.config.height);

			//when notes are loaded, extract urls, get link to load more notes and load them
			TreeBlog.request.onreadystatechange = function() {
				if(this.readyState == 4) {
					var ol = document.createElement('ol');
					ol.innerHTML = this.responseText;
					//var notes = ol.getElementsByClassName('reblog');
					var notes = ol.getElementsByClassName('action')
					var link = ol.getElementsByClassName('more_notes_link')[0];
					var timeout = setTimeout(function() {
						TreeBlog.parseNotes(notes, link);
					}, 100);
				}
			}
			
			//get and parse initially visible notes and link
			var notes = document.getElementsByClassName('action');
			var link = document.getElementsByClassName('more_notes_link')[0];
			TreeBlog.parseNotes(notes, link);
		} else {
			TreeBlog.graph.style.display = 'block';
		}
	},
	
	
	//parse loaded notes
	parseNotes: function(notes, link) {
		for(i = 0; i < notes.length; i++) {
			//get url and type
			var url = notes[i].childNodes[0].innerHTML;
			var type = notes[i].childNodes[1].textContent;
			
			//check if note is not like
			if(type != " likes this") {
				//get source if any
				if(type == " reblogged this from ") {
					var from = notes[i].childNodes[2].innerHTML;
				} else {
					var from = null;
				}
				
				//save information for note
				TreeBlog.notes.push({url: url, from: from , type: type});
				var contents = null;
			}
		}
		
		//check for more notes and load if necessary, else build tree
		if(link){
			var url = link.getAttribute('onclick').split('GET\',\'')[1].split('\'')[0];
			TreeBlog.request.open('GET', url, true);
			TreeBlog.request.send();
		} else {
			TreeBlog.buildTree();
		}
	},
	
	
	//build tree from notes
	buildTree: function() {
		var url_map = {};
		
		for(var i = TreeBlog.notes.length - 1; i >= 0; i--) {
			//if url not in map create new node and add to map
			if(!url_map[TreeBlog.notes[i].url]) {
				var node = new TreeBlog.Node(TreeBlog.notes[i].url, url_map[TreeBlog.notes[i].from]);
				url_map[TreeBlog.notes[i].url] = node;
			
			//else if note has different parent than node in map just create new node
			} else if(url_map[TreeBlog.notes[i]].parent.url != TreeBlog.notes[i].from) {
				var node = new TreeBlog.node(TreeBlog.notes[i].url, url_map[TreeBlog.notes[i].from]);
			}
			
			//insert node if we made one
			if(typeof node !== 'undefined') {
				TreeBlog.graph.insert(node);
			}
		}
		
		//set root node
		if(TreeBlog.notes[TreeBlog.notes.length - 1].type == ' posted this') {
			TreeBlog.graph.root = TreeBlog.graph.nodes[0];
			TreeBlog.graph.root.circle.setAttribute('fill', TreeBlog.config.color.root);
		}
	},
	
	
	//render next frame of balancing animation
	render: function() {
		if(!TreeBlog.graph.balanced) window.requestAnimationFrame(TreeBlog.render);
		
		//initialize total velocity and quad tree
		var total_velocity = 0;
		// var quad_tree = new TreeBlog.QuadTree(TreeBlog.graph.width, TreeBlog.graph.height, TreeBlog.config.max_depth);
		// for(var i = 0; i < TreeBlog.graph.nodes.length; i++) {
			// quad_tree.insert(new TreeBlog.QuadNode(TreeBlog.graph.nodes[i].x, TreeBlog.graph.nodes[i].y, TreeBlog.graph.nodes[i].mass));
		// }
			
		//for each node calculate forces on it
		for(var i = 0; i < TreeBlog.graph.nodes.length; i++) {
			var node = TreeBlog.graph.nodes[i];
			var x_force = 0;
			var y_force = 0;
			
			//calculate pushing force
			for(var j = 0; j < TreeBlog.graph.nodes.length; j++) {
				var x_distance = node.x - TreeBlog.graph.nodes[j].x;
				var y_distance = node.y - TreeBlog.graph.nodes[j].y;
				var distance_squared = x_distance * x_distance + y_distance * y_distance;
				if(distance_squared) {
					var distance = Math.sqrt(distance_squared);
					var force = node.mass * TreeBlog.graph.nodes[j].mass / distance_squared; //* TreeBlog.config.push;
					x_force += force * x_distance / distance;
					y_force += force * y_distance / distance;
				}
			}
			
			//calculate pulling force	
			x_force += node.parent.x - node.x;
			y_force += node.parent.y - node.y;
			for(var j = 0; j < node.children.length; j++) {
				x_force += node.children[j].x - node.x;
				y_force += node.children[j].y - node.y;
			}
			
			//update node's velocity and total velocity
			node.velocity.x = (node.velocity.x + x_force / node.mass) * TreeBlog.config.damping;
			node.velocity.y = (node.velocity.y + y_force / node.mass) * TreeBlog.config.damping;
			total_velocity += Math.sqrt(node.velocity.x * node.velocity.x + node.velocity.y * node.velocity.y);
		}
		
		//drag towards center
		if(TreeBlog.graph.root) {
			TreeBlog.graph.root.velocity.x += TreeBlog.graph.x_center - TreeBlog.graph.root.x;
			TreeBlog.graph.root.velocity.y += TreeBlog.graph.y_center - TreeBlog.graph.root.y;
		}
		
		//move nodes; done directly instead of move method in node object to avoid expense of function call
		for(var i = 0; i < TreeBlog.graph.nodes.length; i++) {
			var node = TreeBlog.graph.nodes[i];
			node.x += node.velocity.x;
			if(node.x < 0) node.x = 0;
			if(node.x > TreeBlog.graph.width) node.x = TreeBlog.graph.width;
			node.circle.setAttribute('cx', node.x);
			if(node.line) node.line.setAttribute('x1', node.x);
			for(var j = 0; j < node.children.length; j++) {
				node.children[j].line.setAttribute('x2', node.x);
			}
			
			node.y += node.velocity.y;
			if(node.y < 0) node.y = 0;
			if(node.y > TreeBlog.graph.height) node.y = TreeBlog.graph.height;
			node.circle.setAttribute('cy', node.y);
			if(node.line) node.line.setAttribute('y1', node.y);
			for(var j = 0; j < node.children.length; j++) {
				node.children[j].line.setAttribute('y2', node.y);
			}
		}
		
		//check if graph is balanced yet
		TreeBlog.graph.balanced = total_velocity < TreeBlog.config.min_velocity;
	},
	
	
	//constructor for force-directed graph
	Graph: function(width, height) {
		this.width = width;
		this.height = height;
		this.x_center = width / 2;
		this.y_center = height / 2;
		this.balanced = true;
		this.root = null;
		this.nodes = [];
		this.total_energy = {x:0,y:0};
		this.active_node = null;
		
		//initialize svg html element
		this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		this.svg.setAttribute('version', '1.2');
		this.svg.id = 'treeblog_graph';
		this.svg.style.width = this.width + 'px';
		this.svg.style.height = this.height + 'px';
		this.svg.style.background = '#fff';
		this.svg.style.position = 'fixed';
		this.svg.style.zIndex = '1000';
		this.svg.style.top = 0;
		this.svg.style.left = 0;
		document.body.appendChild(this.svg);
	},
	
	
	//construction for node in force-directed graph
	Node: function(url, parent) {
		//set basic properties
		this.url = url;
		this.x = TreeBlog.config.width * Math.random();
		this.y = TreeBlog.config.height * Math.random();
		this.mass = Math.PI * 4;
		this.children = [];
		this.velocity = {x: 0, y: 0};
		
		//create svg circle for node
		this.circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
		this.circle.id = TreeBlog.graph.nodes.length;
		this.circle.setAttribute('stroke','#000');
		this.circle.setAttribute('stroke-width',1);
		this.circle.setAttribute('fill',TreeBlog.config.color.node);
		this.circle.setAttribute('r',2);
		this.circle.setAttribute('cx', this.x);
		this.circle.setAttribute('cy', this.y);	
		
		//set parent if any
		if(parent) {
			this.parent = parent;
			parent.children.push(this);
			parent.circle.setAttribute('r', +parent.circle.getAttribute('r') + 0.5);
			parent.mass = Math.PI * +parent.circle.getAttribute('r') * +parent.circle.getAttribute('r');
			
			//draw line between node and parent
			this.line = document.createElementNS('http://www.w3.org/2000/svg','line');
			this.line.setAttribute('stroke','#000');
			this.line.setAttribute('stroke-width',1);
			this.line.setAttribute('x1', this.x);
			this.line.setAttribute('y1', this.y);
			this.line.setAttribute('x2', parent.x);
			this.line.setAttribute('y2', parent.y);
		} else {
			this.parent = this; //let's us skip checking for parent when calculating pull since vast majority of nodes do have one; will just calculate distance and pull as 0 for parentless nodes
		}
	},
	
	//quad tree and quad node constructors for unimplemented optimization
	QuadTree: function(width, height, max_depth) {
		this.width = width;
		this.height = height;
		this.max_depth = max_depth;
		this.root = new TreeBlog.QuadNode(0, 0, 0);
		this.root.children = [[null, null], [null, null]];
		this.root.width = width;
	},
	
	QuadNode: function(x, y, mass) {
		this.x = x;
		this.y = y;
		this.mass = mass;
		this.children = null;
		this.width = null;
	}
};
	
//prototype for Graph object
TreeBlog.Graph.prototype = {
	insert: function(node) {
		this.nodes.push(node);
		this.svg.appendChild(node.circle);
				
		//check whether to insert node's circle or parent's circle
		if(node.line) {
			if(+node.circle.id < +node.parent.circle.id) {
				TreeBlog.graph.svg.insertBefore(node.line, node.circle);
			} else {
				TreeBlog.graph.svg.insertBefore(node.line, node.parent.circle);
			}
		}
		if(this.balanced) this.balance();
	},
	
	balance: function() {
		this.balanced = false;
		TreeBlog.render();
	}
}


//prototype for node object
TreeBlog.Node.prototype = {
	//set parent of node
	setParent: function(node) {
		//set basic properties for parent and child nodes
		this.parent = node;
		node.children.push(this);
		node.circle.setAttribute('r', +node.circle.getAttribute('r') + 0.5);
		node.mass = Math.PI * +node.circle.getAttribute('r') * +node.circle.getAttribute('r');
		
		//draw line between child and parent
		this.line = document.createElementNS('http://www.w3.org/2000/svg','line');
		this.line.setAttribute('stroke','#000');
		this.line.setAttribute('stroke-width',1);
		this.line.setAttribute('x1', this.x);
		this.line.setAttribute('y1', this.y);
		this.line.setAttribute('x2', node.x);
		this.line.setAttribute('y2', node.y);
		
		//check whether to insert node's circle or parent's circle
		if(parseInt(this.circle.id) < parseInt(this.parent.circle.id)) {
			TreeBlog.graph.svg.insertBefore(this.line, this.circle);
		} else {
			TreeBlog.graph.svg.insertBefore(this.line, this.parent.circle);
		}
	},
	
	//iterate through all ancestors
	ancestors: function(callback) {
		var node = this.parent;
		while(node) {
			callback(node);
			node = node.parent;
		}
	},
	
	//iterate through all descendants
	descendants: function(callback) {
		var queue = this.children.slice(0);
		while(queue.length > 0) {
			var node = queue.shift();
			callback(node);
			queue = queue.concat(node.children);
		}
	}
};

//prototype for quad tree for unimplemented optimization
TreeBlog.QuadTree.prototype = {
	insert: function(node) {
		//initialize variables
		var current_node = this.root;
		var x_mid = this.width / 2;
		var y_mid = this.height / 2;
		var x_delta = this.width / 4;
		var y_delta = this.height / 4;
		var depth = 0;
		
		//traverse tree until till place to insert or max depth reached
		while(true) {
			//if current node has no children add them and put itself in appropriate spot to split
			if(!current_node.children && depth < this.max_depth) {
				current_node.children = [[null, null], [null, null]];
				current_node.children[+(current_node.x > x_mid)][+(current_node.y > y_mid)] = new TreeBlog.QuadNode(current_node.x, current_node.y, current_node.mass);
			}
			
			//update center of mass and total mass for node
			current_node.x = (current_node.x * current_node.mass + node.x * node.mass) / (current_node.mass + node.mass);
			current_node.y = (current_node.y * current_node.mass + node.y * node.mass) / (current_node.mass + node.mass);
			current_node.mass += node.mass;
			
			//if not at max depth attempt to insert node, else finish
			if(depth < this.max_depth) {
				//calculate which side of mid lines node is on
				var x_side = node.x > x_mid;
				var y_side = node.y > y_mid;
				
				//place node in quadrant if open, else go down a level
				if(!current_node.children[+x_side][+y_side]) {
					current_node.children[+x_side][+y_side] = node;
					node.width = x_delta * 4;
					return true;
				} else {
					current_node = current_node.children[+x_side][+y_side];
					x_mid += x_side ? x_delta : -x_delta;
					y_mid += y_side ? y_delta : -y_delta;
					x_delta /= 2;
					y_delta /= 2;
					depth++;
				}
			} else {
				return true;
			}
		}
	}
};