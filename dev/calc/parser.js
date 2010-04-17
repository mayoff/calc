if (this.console === undefined) {
	this.console = {
		log: function(s) { print(s); }
	}
}

function parse(input) {

	function beget(base, properties) {
		function constructor() {}
		constructor.prototype = base;
		return extend(new constructor(), properties);
	}
	
	function extend(object, properties) {
		for (key in properties) {
			object[key] = properties[key];
		}
		return object;
	}

	///////////////////////////////////////////////////////////////////////////
	// Lexical analysis

	var length = input.length,
		offset = 0,
		token;

	function consume() {
		var consumed = token;
		token = lex();
		return consumed;
	};
	
	var tokenTypes = {};

	var primitiveType = {
		parseAsPrefix: function() { throw 'Cannot use ' + this.name + ' as a prefix/standalone.'; },
		parseAsSuffix: function() { throw 'Cannot use ' + this.name + ' as a suffix.'; },
	};
	
	function nodeToString(node) {
		if (node === null) {
			return 'null';
		} else if (node === undefined) {
			return 'undefined';
		} else {
			return node.toString();
		}
	}
	
	function simpleType(name, precedence, extensions) {
		precedence = precedence || 0;
		var type = tokenTypes[name];
		if (type) {
			type.precedence = Math.max(type.precedence, precedence);
		} else {
			type = tokenTypes[name] = beget(primitiveType, {
				name: name,
				precedence: precedence,
				toString: function() { return this.name; },
			});
		}
		extend(type, extensions);
		return type;
	}
	
	function infixType(name, precedence, extensions) {
		var type = simpleType(name, precedence, {
			parseAsSuffix: function(lhs) {
				return extend(this, {
					lhs: lhs,
					rhs: expression(this.isRightAssociative ? this.precedence - 1 : this.precedence),
				});
			},
			toString: function() {
				return '[' + nodeToString(this.lhs) + ' ' + this.name + ' ' + nodeToString(this.rhs) + ']';
			},
			pushUserHtml: function(array) {
				this.lhs.pushUserHtml(array);
				array.push(' ', this.userHtml || this.name, ' ');
				this.rhs.pushUserHtml(array);
			},
		});
		return extend(type, extensions);
	}
	
	function prefixType(name, precedence, extensions) {
		var type = simpleType(name, undefined, {
			parseAsPrefix: function() {
				this.rhs = expression(precedence);
				return this;
			},
			toString: function() {
				return '[' + this.name + ' ' + nodeToString(this.rhs) + ']';
			},
			pushUserHtml: function(array) {
				array.push(this.userHtml || this.name, ' ');
				this.rhs.pushUserHtml(array);
			},
		});
		return extend(type, extensions);
	}

	END = '(end)';
	simpleType(END, undefined, {
		parseAsPrefix: function() { return this; },
		pushUserHtml: function(array) { array.push('<span class="endIndicator">&#x2038;</span>'); },
	});
	
	NUMBER = '(number)';
	simpleType(NUMBER, undefined, {
		toString: function() { return String(this.value); },
		pushUserHtml: function(array) { array.push(String(this.value)); },
		parseAsPrefix: function() { return this; },
	});
	
	simpleType(')');

	infixType('+', 50);
	infixType('-', 50, { userHtml: '&minus;', });
	infixType('*', 60, { userHtml: '&times;', });
	infixType('/', 60, { userHtml: '&divide;', });
	prefixType('-', 80);
	infixType('^', 90, { isRightAssociative: true, });
	simpleType('(', 100, {
		parseAsPrefix: function() {
			this.rhs = expression(0);
			if (token.name === END) { this.isOpen = true; }
			else if (token.name == ')') { consume(); }
			else { throw 'Missing right parenthesis.'; }
			return this;
		},
		toString: function() { return '(' + nodeToString(this.rhs) + (this.isOpen ? '?' : ')'); },
		pushUserHtml: function(array) {
			array.push('(');
			this.rhs.pushUserHtml(array);
			array.push(this.isOpen ? '<span class="hint">)</span>' : ')');
		},
	});

	numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;

	function lex() {
		var c;
		while (true) {
			if (offset >= length)
				return beget(tokenTypes[END]);
			c = input[offset];
			if (c !== ' ')
				break;
			++offset;
		}
		
		if (c in tokenTypes) {
			++offset;
			return beget(tokenTypes[c]);
		}

		if ('0123456789.'.indexOf(c) >= 0) {
			numberRe.lastIndex = offset;
			number = Number(numberRe.exec(input)[0]);
			offset = numberRe.lastIndex;
			return beget(tokenTypes[NUMBER], { value: number });
		}

		throw 'Invalid character "' + c + '" at offset ' + offset;
	}

	///////////////////////////////////////////////////////////////////////////
	// Syntatic analysis

	function expression(leftOpPrecedence) {
		var node = consume().parseAsPrefix();
		while (leftOpPrecedence < token.precedence) {
			node = consume().parseAsSuffix(node);
		}
		return node;
	}
	
	///////////////////////////////////////////////////////////////////////////

	// Set token to the first token.
	consume();
	return expression(0);
}

function test(s) {
	var node = parse(s);
	var fragments = [];
	node.pushUserHtml(fragments);
	var e = document.createElement('DIV');
	e.innerHTML = fragments.join('');
	document.body.appendChild(e);
}

test('--123 + (-4.56)^-.78^2  ');
