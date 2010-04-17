if (this.console === undefined) {
	this.console = {
		log: function(s) { print(s); }
	}
}

function parse(input) {

	function beget(base, properties) {
		function constructor() {}
		constructor.prototype = base;
		var object = new constructor(), key;
		for (key in properties) {
			object[key] = properties[key];
		}
		return object;
	}

	///////////////////////////////////////////////////////////////////////////
	// Lexical analysis

	var length = input.length, offset = 0, token;

	function consume() {
		var consumed = token;
		token = lex();
		return consumed;
	};

	var Token = {
		toString: function() {
			return 'Token(' + this.type + ' "' + this.text + '" at ' + this.offset + ')';
		},
		
		Type_End: '(end)',
		Type_Number: '(number)',
	};
	
	function makeToken(type, textLength) {
		if (textLength === undefined) {
			textLength = type.length;
		}
		var token = beget(Token, {type: type, text: input.substr(offset, textLength), offset: offset});
		offset += textLength;
		return token;
	}

	numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;

	function lex() {
		var c;
		while (offset < length) {
			c = input[offset];
			if (c !== ' ')
				break;
			++offset;
		}
		if (offset >= length) {
			return makeToken(Token.Type_End, 0);
		}

		if ('+-*/()^'.indexOf(c) >= 0) {
			return makeToken(c);
		}

		if ('0123456789.'.indexOf(c) >= 0) {
			numberRe.lastIndex = offset;
			return makeToken(Token.Type_Number, numberRe.exec(input)[0].length);
		}

		throw 'Invalid character "' + c + '" at offset ' + offset;
	}

	///////////////////////////////////////////////////////////////////////////
	// Syntatic analysis

	function expression(leftOpPrecedence) {		
		var node = consume().parseAsPrefix();
		while (leftOpPrecedence < token.precedence) {
			node = consume().parseAsInfix(node);
		}
		return left;
	}

	// Set token to the first token.
	consume();
	while (token.type !== Token.Type_End) {
		console.log(consume().toString());
	}
}

parse(' -123 + 4.56^.78  ');
