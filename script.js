window.isAtBottom = function() {
    return window.innerHeight + window.scrollY === document.height;
};

Calc = new (function() {

     var parse = (function() {
    
        // These change on every call to parse.
        var input, length, offset, token;
        
        // These are static.
        var tokenPrototypes = {},
            primitivePrototype = {
                prefixParse: function() { throw 'Cannot use ' + this.name + ' as a prefix/standalone.'; },
                suffixParse: function() { throw 'Cannot use ' + this.name + ' as a suffix.'; },
                value: function(defaultValue) { return defaultValue; }
            },
            endIndicatorHtml = '<span class="endIndicator">&#x2038;</span>',
            END = '(end)',
            NUMBER = '(number)',
            POINT = '(point)',
            numberRe = /[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g;

        // Syntatic analysis.    More syntatic analysis is found in the prefixParse and suffixParse methods of the parse tree node prototypes.

        function _parse(s) {
            input = s;
            length = s.length;
            offset = 0;
            consume(); // This initializes token.
            var node = expression(0);
            if (token.name != END) {
                throw 'Extra stuff after expression';
            }
            input = token = null;
            return node;
        }
    
        function expression(leftOpPrecedence) {
                for (var node = consume().prefixParse(); leftOpPrecedence < token.precedence; ) {
                        node = consume().suffixParse(node);
                }
                return node;
        }

        // Helper functions.
        
        function beget(base, properties) {
            function Constructor() {}
            Constructor.prototype = base;
            return extend(new Constructor(), properties);
        }

        function extend(object, properties) {
            for (key in properties) {
                object[key] = properties[key];
            }
            return object;
        }

        // Parse tree node prototypes.

        function simple(name, precedence, extensions) {
            precedence = precedence || 0;
            var type = tokenPrototypes[name];
            if (type) {
                type.precedence = Math.max(type.precedence, precedence);
            } else {
                type = tokenPrototypes[name] = beget(primitivePrototype, {
                    name: name,
                    precedence: precedence
                });
            }
            extend(type, extensions);
            return type;
        }

        function prefix(name, precedence, extensions) {
            var type = simple(name, undefined, {
                prefixParse: function() {
                    this.isUnary = true;
                    this.rhs = expression(precedence);
                    return this;
                },
                pushHtml: function(array) {
                    array.push(this.html || this.name, ' ');
                    this.rhs.pushHtml(array);
                },
                permissibleFollowers: function() { return this.rhs.permissibleFollowers(); }
            });
            return extend(type, extensions);
        }

        function infix(name, precedence, extensions) {
            var type = simple(name, precedence, {
                suffixParse: function(lhs) {
                    return extend(this, {
                        lhs: lhs,
                        rhs: expression(this.isRightAssociative ? this.precedence - 1 : this.precedence)
                    });
                },
                pushHtml: function(array) {
                    this.lhs.pushHtml(array);
                    array.push(' ', this.html || this.name, ' ');
                    this.rhs.pushHtml(array);
                },
                permissibleFollowers: function() { return this.rhs.permissibleFollowers(); }
            });
            return extend(type, extensions);
        }
        
        simple(END, 0, {
            prefixParse: function() { return this; },
            pushHtml: function(array) { array.push(endIndicatorHtml); },
            permissibleFollowers: function() {
                return FollowerTypes.Prefix | FollowerTypes.Digit | FollowerTypes.Point;
            }
        });
        
        simple(NUMBER, undefined, {
            prefixParse: function() { return this; },
            value: function() { return Number(this.text); },
            pushHtml: function(array) { array.push(this.text); },
            permissibleFollowers: function() {
                return (FollowerTypes.Suffix | FollowerTypes.Digit |
                    (this.text.indexOf('.') == -1 ? FollowerTypes.Point : 0));
            }
        });

        // POINT is used when input[length-1] === '.' and index[length-2] is not a digit.
        simple(POINT, undefined, {
            prefixParse: function() { return this; },
            value: function(defaultValue) { return defaultValue; },
            pushHtml: function(array) { array.push('.', endIndicatorHtml); },
            permissibleFollowers: function() { return FollowerTypes.Digit; }
        });
        
        infix('+', 50, { value: function() { return this.lhs.value() + this.rhs.value(0); } });
        infix('-', 50);
        infix('*', 60, { html: '&times;', value: function() { return this.lhs.value() * this.rhs.value(1); } });
        infix('/', 60, { html: '&divide;', value: function() { return this.lhs.value() / this.rhs.value(1); } });
        prefix('-', 80, {
            value: function() { return (this.lhs ? this.lhs.value() : 0) - this.rhs.value(0); },
            pushHtml: function(array) {
                if (!this.isUnary) {
                    this.lhs.pushHtml(array);
                    array.push(' ');
                }
                array.push('&minus; ');
                this.rhs.pushHtml(array);
            }
        });
        infix('^', 90, {
            isRightAssociative: true,
            value: function() { return Math.pow(this.lhs.value(), this.rhs.value(1)); },
            pushHtml: function(array) {
                this.lhs.pushHtml(array);
                array.push('<sup>');
                this.rhs.pushHtml(array);
                array.push('</sup>');
            }
        });

        simple('(', 100, {
            prefixParse: function() {
                this.rhs = expression(0);
                if (token.name === END) { this.isOpen = true; }
                else if (token.name == ')') { consume(); }
                else { throw 'Missing right parenthesis.'; }
                return this;
            },
            value: function(defaultValue) { return this.rhs.value(defaultValue); },
            pushHtml: function(array) {
                array.push('(');
                this.rhs.pushHtml(array);
                array.push(this.isOpen ? '<span class="hint">)</span>' : ')');
            },
            permissibleFollowers: function() {
                if (this.isOpen) {
                    var pf = this.rhs.permissibleFollowers();
                    if (pf & FollowerTypes.Suffix) pf |= FollowerTypes.CloseParenthesis;
                    return pf;
                }
                else return FollowerTypes.Suffix;
            }
        });
        simple(')');
    
        // Lexical analysis.    
    
        function consume() {
            var consumed = token;
            token = lex();
            return consumed;
        }

        function lex() {
            var c;
            while (true) {
                if (offset >= length)
                    return beget(tokenPrototypes[END]);
                c = input[offset];
                if (c !== ' ')
                    break;
                ++offset;
            }

            if (c in tokenPrototypes) {
                ++offset;
                return beget(tokenPrototypes[c]);
            }

            if (c === '.' && offset === length - 1) {
                ++offset;
                return beget(tokenPrototypes[POINT], { text: c });
            }

            if ('0123456789.'.indexOf(c) >= 0) {
                numberRe.lastIndex = offset;
                var text = numberRe.exec(input)[0];
                offset = numberRe.lastIndex;
                return beget(tokenPrototypes[NUMBER], { text: text });
            }

            throw 'Invalid character "' + c + '" at offset ' + offset;
        }

        return _parse;  
    })();

    var
	STATE_VERSION = '2',
	transcriptDom = document.getElementById('transcript'),
        buttons = Array.prototype.map.call(document.getElementsByClassName('button'), function(e) { return e; }),
        controlsDiv = document.getElementById('controls'),
        controlsMask = document.getElementById('controlsMask'),
        buttonParensLabel = document.getElementById('buttonParensLabel'),

        // All equations in the transcript.
        equations = [],

	// The current equation.  This points to the last element of equations.
	currentEquation = null,

	// buttonsByLocation[i] is the button at location (i % 5, i / 4) in the button grid
	buttonsByLocation = null,

	suppressTouch = false,

	totalTime = 0,
	timeCount = 0,

	FollowerTypes = {
	    Prefix: 0x1,
	    Suffix: 0x2,
	    Digit: 0x4,
	    Point: 0x8,
	    CloseParenthesis: 0x10,
	},

	buttonTraits = {
	    'button0': { text: '0', followerTypes: FollowerTypes.Digit, },
	    'button1': { text: '1', followerTypes: FollowerTypes.Digit, },
	    'button2': { text: '2', followerTypes: FollowerTypes.Digit, },
	    'button3': { text: '3', followerTypes: FollowerTypes.Digit, },
	    'button4': { text: '4', followerTypes: FollowerTypes.Digit, },
	    'button5': { text: '5', followerTypes: FollowerTypes.Digit, },
	    'button6': { text: '6', followerTypes: FollowerTypes.Digit, },
	    'button7': { text: '7', followerTypes: FollowerTypes.Digit, },
	    'button8': { text: '8', followerTypes: FollowerTypes.Digit, },
	    'button9': { text: '9', followerTypes: FollowerTypes.Digit, },
	    'buttonPoint': { text: '.', followerTypes: FollowerTypes.Point, },
	    'buttonPlus': { text: '+', followerTypes: FollowerTypes.Suffix, },
	    'buttonMinus': { text: '-', followerTypes: FollowerTypes.Prefix | FollowerTypes.Suffix, },
	    'buttonTimes': { text: '*', followerTypes: FollowerTypes.Suffix, },
	    'buttonDivide': { text: '/', followerTypes: FollowerTypes.Suffix, },
	    'buttonExponent':  { text: '^', followerTypes: FollowerTypes.Suffix, },
	    'buttonParens': { },
	    'buttonBackspace': { action: function(isFinalEvent) { backspace(isFinalEvent); }, followerTypes: ~0, },
	    'buttonEnter': { action: function() { startNewEquation(); }, },
	    'buttonDrag1': { action: function() {}, followerTypes: ~0 }
	};

    function pushHtmlForValue(fragments, value) {
        if (value === Number.NEGATIVE_INFINITY) {
            fragments.push('-&#x221e');
        } else if (value === Number.POSITIVE_INFINITY) {
            fragments.push('&#x221e');
        } else if (isNaN(value)) {
            fragments.push('undefined');
        } else {
            var s;
            for (var i = 1; i <= 21; ++i) {
                s = value.toPrecision(i);
                if (Number(s) === value)
                    break;
            }
            fragments.push(value);
        }
    }

    function setCurrentText(text) {
        var eq = currentEquation, newNode, fragments, value;
        if (text === eq.text)
            return;
        try {
            newNode = parse(text);
            eq.text = text;
            eq.node = newNode;
            fragments = [];
            eq.node.pushHtml(fragments);
            value = eq.node.value();
            if (value != null) {
                fragments.push('<span class="result"><span class="equalSign">=</span>');
                pushHtmlForValue(fragments, value);
                fragments.push('</span><br clear="both" />');
            }
            eq.dom.innerHTML = fragments.join('');
        } catch (e) { }
    }

    function makeEquationDiv() {
        var dom = document.createElement('div');
        dom.className = 'equation';
        transcriptDom.appendChild(dom);
        return dom;
    }

    function startNewEquation() {
        var eq = currentEquation;
        if (eq) {
            if (eq.dom) {
                eq.dom.className = 'equation';
            }
            eq.node = null;
        }
        eq = currentEquation = {
            text: null,
            node: null,
            dom: makeEquationDiv()
        };
        eq.dom.className = 'equation current';
        equations.push(eq);
        setCurrentText('');
        if (equations.length > 100) {
            transcript.Dom.removeChild(equations[0].dom);
            equations.shift();
        }
    }

    function append(s) {
        setCurrentText(pretouchText + s);
    }

    function backspace(isFinalEvent) {
        if (pretouchText.length  > 0) {
            setCurrentText(pretouchText.slice(0, -1));
        } else if (isFinalEvent && this.equations.length > 1) {
	    var eq = this.currentEquation;
            transcriptDom.removeChild(eq.dom);
            equations.pop();
            eq = currentEquation = equations[equations.length - 1];
            eq.dom.className = 'equation current';
            eq.node = parse(eq.text);
        }
    }

    function appendOpenParenthesis() {
        setCurrentText(pretouchText + '(');
    }

    function appendCloseParenthesis() {
        setCurrentText(pretouchText + ')');
    }

    function addParentheses() {
        setCurrentText('(' + pretouchText + ')');
    }

    function removeParentheses() {
        setCurrentText(pretouchText.slice(1, -1));
    }

    function buttonAtPagePoint(x, y) {
        x = Math.floor(x / 64);
        y = Math.floor((y - controlsDiv.offsetTop) / 64);
        var button = buttonsByLocation[5*y + x];
        return (button && button.isEnabled) ? button : null;
    }

    function setControlsMaskVisibility() {
        controlsMask.style.opacity = (window.isAtBottom() && !suppressTouch) ? 0 : 1;
    }

    function handleScrollEvent(e) {
        setControlsMaskVisibility();
        return true;
    }

    function handleTranscriptEvent(e) {
        setControlsMaskVisibility();
        return true;
    }

    function handleControlsEvent(e) {
        var startTime = new Date();
        e.preventDefault(); // prevent scrolling
        e.stopPropagation();

        if (!window.isAtBottom()) {
            suppressTouch = true;
            scrollToBottom();
            return false;
        }

        if (suppressTouch) {
            if (e.type == 'touchend' || e.type == 'touchcancel')
                suppressTouch = false;
            setControlsMaskVisibility();
            return false;
        }

        var isFirstEvent = (e.type === 'touchstart' || e.type === 'click');
        var isFinalEvent = (e.type === 'touchend' || e.type === 'click');

        if (isFirstEvent) {
            pretouchText = currentEquation.text;
        }

        else if (e.type === 'touchcancel') {
            setCurrentText(pretouchText);
            enableButtons();
            scrollToBottom();
            return false;
        }

        var x, y;
        if (e.type === 'click') {
            x = e.pageX;
            y = e.pageY;
        }
        else {
            var touch = e.type === 'touchend' ? e.changedTouches[0] : e.touches[0];
            x = touch.pageX;
            y = touch.pageY;
        }

        var button = buttonAtPagePoint(x, y);
        if (button && button.isEnabled) {
            if (button.id !== 'buttonEnter' || isFinalEvent)
                buttonWasClicked(button, isFinalEvent);
            if (isFinalEvent) {
                enableButtons();
                saveState();
            }
        } else if (pretouchText !== currentEquation.text) {
            setCurrentText(pretouchText);
            scrollToBottom();
        }

        document.body.offsetHeight;
        var endTime = new Date();
        if (button && button.id == 'buttonDrag1') {
            currentEquation.dom.innerText = String(totalTime / timeCount);
            if (e.type == 'touchend') {
                totalTime = timeCount = 0;
            }
        } else {
            totalTime += endTime.getTime() - startTime.getTime();
            timeCount++;
        }
        return false;
    }

    function buttonWasClicked(button, isFinalEvent) {
	if (button.traits.action) {
	    button.traits.action.call(this, isFinalEvent);
	} else if (button.traits.text) {
	    append(button.traits.text);
	}
        scrollToBottom();
        return false;
    }

    function initializeButtons() {
        buttonsByLocation = [];
        buttons.forEach(function(button) {
            button.traits = buttonTraits[button.id];
            buttonsByLocation[5 * Math.floor(button.offsetTop / 64) + Math.floor(button.offsetLeft / 64)] = button;
        }, this);

        var proxy = { handleEvent: function() { return handleControlsEvent.apply(Calc, arguments); } };
        controlsDiv.addEventListener('click', proxy, true); // for Safari debugging
        controlsDiv.addEventListener('touchstart', proxy, true);
        controlsDiv.addEventListener('touchmove', proxy, true);
        controlsDiv.addEventListener('touchend', proxy, true);
        controlsDiv.addEventListener('touchcancel', proxy, true);
        controlsDiv.addEventListener('selectstart', this, true);

        proxy = { handleEvent: function(e) { return handleTranscriptEvent.apply(Calc, arguments); } };
        transcriptDom.addEventListener('touchstart', proxy, false);
        transcriptDom.addEventListener('touchmove', proxy, false);
        transcriptDom.addEventListener('touchend', proxy, false);
        transcriptDom.addEventListener('touchcancel', proxy, false);
        transcriptDom.addEventListener('selectstart', proxy, false);
        transcriptDom.addEventListener('select', proxy, false);
        transcriptDom.addEventListener('gesturestart', proxy, false);
        transcriptDom.addEventListener('gesturechange', proxy, false);
        transcriptDom.addEventListener('gestureend', proxy, false);

        proxy = {
            handleEvent: function(e) {
                setControlsMaskVisibility();
                return true;
            },
        };
        document.addEventListener('scroll', proxy, true);
    }

    function setButtonEnabled(button, isEnabled) {
        if (button.isEnabled !== isEnabled) {
            button.isEnabled = isEnabled;
            button.style.opacity = isEnabled ? 1 : .5;
        }
    }

    function enableButtons() {
        var pf = currentEquation.node.permissibleFollowers();
        var l = buttons.length, button;
        for (var i = 0; i < l; ++i) {
            button = buttons[i];
            if (button.id === 'buttonEnter') {
                setButtonEnabled(button, currentEquation.text.length > 0);
            }

            else if (button.id === 'buttonParens') {
                if (pf & FollowerTypes.Prefix) {
                    setButtonEnabled(button, true);
                    buttonParensLabel.innerHTML = '(';
                    button.traits.action = appendOpenParenthesis;
                }
                else if (pf & FollowerTypes.CloseParenthesis) {
                    setButtonEnabled(button, true);
                    buttonParensLabel.innerHTML = ')';
                    button.traits.action = appendCloseParenthesis;
                }
                else if (currentEquation.node.name == '(' && !currentEquation.node.isOpen) {
                    setButtonEnabled(button, true);
                    buttonParensLabel.innerHTML = '<span class="removeParens">(</span>&#x2026;<span class="removeParens">)</span>';
                    button.traits.action = removeParentheses;
                }
                else {
                    setButtonEnabled(button, true);
                    buttonParensLabel.innerHTML = '(&#x2026;)';
                    button.traits.action = addParentheses;
                }
            }
            
            else if (button.id === 'buttonBackspace') {
                setButtonEnabled(button,
                    currentEquation.text.length > 0 || equations.length > 1);
            }

            else {
                setButtonEnabled(button, (button.traits.followerTypes & pf) !== 0);
            }
        }
    }

    function _scrollToBottom() {
        document.body.offsetTop;
        document.body.scrollTop = document.body.scrollHeight;
        setControlsMaskVisibility();
    }

    function scrollToBottom() {
        _scrollToBottom();
        setTimeout(_scrollToBottom, 0);
    }

    function loadState() {
        var ls = localStorage, version = ls.version || 0;
        if (version !== STATE_VERSION) {
            startNewEquation();
            return;
        }

        try {
            var l = localStorage.count, eq;
            var eqs = equations = [];
            for (var i = 0; i < l; ++i) {
                var eq = {
                    text: ls['text' + i],
                    dom: makeEquationDiv()
                };
                eq.dom.innerHTML = ls['html' + i];
                eqs.push(eq);
            }
            if (eqs.length === 0)  {
                startNewEquation();
            } else {
                eq = currentEquation = eqs[eqs.length - 1];
                eq.dom.className = 'equation current';
                eq.node = parse(eq.text);
            }
        } catch (e) {
            console.log(e);
            equations = [];
            startNewEquation();
        }
    }
    
    function saveState() {
        var ls = localStorage, eqs = equations, l = eqs.length, eq;
        ls.clear();
        ls.version = 0; // Set to actual version below, after all state is saved.
        ls.count = l;
        for (var i = 0; i < l; ++i) {
            eq = eqs[i];
            ls['text' + i] = eq.text;
            ls['html' + i] = eq.dom.innerHTML;
        }
        ls.version = STATE_VERSION;
    }

    this.onLoad = function() {
        initializeButtons();
        loadState();
        scrollToBottom();
        enableButtons();
        return true;
    }

})();

window.addEventListener('load', function() { Calc.onLoad(); }, false);
