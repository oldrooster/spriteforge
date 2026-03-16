(function () {
    const modal = document.getElementById('chat-modal');
    const closeBtn = document.getElementById('chat-close-btn');
    const newBtn = document.getElementById('chat-new-btn');
    const chatBtn = document.getElementById('header-chat-btn');
    const messagesEl = document.getElementById('chat-messages');
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const interviewBtn = document.getElementById('chat-interview-btn');

    let sessionId = null;
    let mode = 'chat';
    let sending = false;
    let artStyle = '';

    // Fetch art style from project settings
    async function fetchArtStyle() {
        try {
            var resp = await fetch('/api/projects/default');
            var data = await resp.json();
            artStyle = data.art_style || '';
        } catch (e) {
            artStyle = '';
        }
    }

    function open() {
        fetchArtStyle();
        modal.hidden = false;
        inputEl.focus();
    }

    function close() {
        modal.hidden = true;
    }

    function resetChat() {
        if (sessionId) {
            fetch('/api/chat/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId }),
            });
        }
        sessionId = null;
        mode = 'chat';
        sending = false;
        messagesEl.innerHTML = '';
        renderWelcome();
        inputEl.value = '';
        inputEl.disabled = false;
        sendBtn.disabled = false;
    }

    function renderWelcome() {
        var welcome = document.createElement('div');
        welcome.className = 'chat-welcome';
        welcome.innerHTML =
            '<p>I can help you craft the perfect prompts for generating game art assets.</p>' +
            '<button class="btn btn-primary chat-interview-start">Ask me questions</button>' +
            '<p class="hint">Or just type a message below to chat freely.</p>';
        messagesEl.appendChild(welcome);

        welcome.querySelector('.chat-interview-start').addEventListener('click', startInterview);
    }

    function addMessage(role, text) {
        // Remove welcome if present
        var welcome = messagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        var msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-' + role;

        var label = document.createElement('div');
        label.className = 'chat-msg-label';
        label.textContent = role === 'user' ? 'You' : 'Assistant';
        msg.appendChild(label);

        var body = document.createElement('div');
        body.className = 'chat-msg-body';
        body.textContent = text;
        msg.appendChild(body);

        messagesEl.appendChild(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return msg;
    }

    function addOptions(options, callback) {
        var container = document.createElement('div');
        container.className = 'chat-options';

        options.forEach(function (opt) {
            var btn = document.createElement('button');
            btn.className = 'btn btn-secondary btn-small chat-option-btn';
            btn.textContent = opt;
            btn.addEventListener('click', function () {
                // Disable all option buttons
                container.querySelectorAll('.chat-option-btn').forEach(function (b) {
                    b.disabled = true;
                });
                btn.classList.add('chat-option-selected');
                callback(opt);
            });
            container.appendChild(btn);
        });

        messagesEl.appendChild(container);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addPromptResult(prompt) {
        var container = document.createElement('div');
        container.className = 'chat-prompt-result';

        var label = document.createElement('div');
        label.className = 'chat-prompt-result-label';
        label.textContent = 'Generated Prompt:';
        container.appendChild(label);

        var text = document.createElement('div');
        text.className = 'chat-prompt-result-text';
        text.textContent = prompt;
        container.appendChild(text);

        var actions = document.createElement('div');
        actions.className = 'chat-prompt-result-actions';

        var copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-primary btn-small';
        copyBtn.textContent = 'Copy Prompt';
        copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(prompt).then(function () {
                copyBtn.textContent = 'Copied!';
                setTimeout(function () { copyBtn.textContent = 'Copy Prompt'; }, 1500);
            });
        });
        actions.appendChild(copyBtn);

        var useBtn = document.createElement('button');
        useBtn.className = 'btn btn-accent btn-small';
        useBtn.textContent = 'Use in AI Generate';
        useBtn.addEventListener('click', function () {
            window.pendingChatPrompt = prompt;
            close();
            if (state.currentAssetId) {
                navigate('#/asset/' + state.currentAssetId + '/tool/ai-generate');
            } else {
                navigate('#/tool/ai-generate');
            }
        });
        actions.appendChild(useBtn);

        container.appendChild(actions);
        messagesEl.appendChild(container);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addThinking() {
        var msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-assistant chat-thinking';

        var label = document.createElement('div');
        label.className = 'chat-msg-label';
        label.textContent = 'Assistant';
        msg.appendChild(label);

        var body = document.createElement('div');
        body.className = 'chat-msg-body';
        body.textContent = 'Thinking...';
        msg.appendChild(body);

        messagesEl.appendChild(msg);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return msg;
    }

    async function sendMessage(text) {
        if (sending || !text) return;
        sending = true;
        inputEl.disabled = true;
        sendBtn.disabled = true;

        addMessage('user', text);
        inputEl.value = '';

        var thinkingEl = addThinking();

        try {
            var resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    session_id: sessionId,
                    mode: mode,
                    art_style: artStyle,
                }),
            });

            var data = await resp.json();

            if (thinkingEl.parentNode) thinkingEl.remove();

            if (data.error) {
                addMessage('assistant', 'Error: ' + data.error);
                sending = false;
                inputEl.disabled = false;
                sendBtn.disabled = false;
                return;
            }

            sessionId = data.session_id;

            if (mode === 'interview' && data.structured) {
                var s = data.structured;
                addMessage('assistant', s.message);

                if (s.done && s.prompt) {
                    addPromptResult(s.prompt);
                    mode = 'chat'; // Switch back to free chat
                } else if (s.options && s.options.length > 0) {
                    addOptions(s.options, function (choice) {
                        sendMessage(choice);
                    });
                }
            } else {
                addMessage('assistant', data.reply);
            }
        } catch (e) {
            if (thinkingEl.parentNode) thinkingEl.remove();
            addMessage('assistant', 'Error: Failed to connect to chat service.');
        }

        sending = false;
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
    }

    async function startInterview() {
        // Remove welcome
        var welcome = messagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        mode = 'interview';
        sending = true;
        inputEl.disabled = true;
        sendBtn.disabled = true;

        var thinkingEl = addThinking();

        try {
            var resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '',
                    session_id: sessionId,
                    mode: 'interview',
                    art_style: artStyle,
                }),
            });

            var data = await resp.json();
            if (thinkingEl.parentNode) thinkingEl.remove();

            if (data.error) {
                addMessage('assistant', 'Error: ' + data.error);
                sending = false;
                inputEl.disabled = false;
                sendBtn.disabled = false;
                return;
            }

            sessionId = data.session_id;

            if (data.structured) {
                var s = data.structured;
                addMessage('assistant', s.message);
                if (s.options && s.options.length > 0) {
                    addOptions(s.options, function (choice) {
                        sendMessage(choice);
                    });
                }
            } else {
                addMessage('assistant', data.reply);
            }
        } catch (e) {
            if (thinkingEl.parentNode) thinkingEl.remove();
            addMessage('assistant', 'Error: Failed to connect to chat service.');
        }

        sending = false;
        inputEl.disabled = false;
        sendBtn.disabled = false;
    }

    // Event listeners
    if (chatBtn) {
        chatBtn.addEventListener('click', open);
    }

    closeBtn.addEventListener('click', close);
    newBtn.addEventListener('click', resetChat);

    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });

    sendBtn.addEventListener('click', function () {
        var text = inputEl.value.trim();
        if (text) sendMessage(text);
    });

    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            var text = inputEl.value.trim();
            if (text) sendMessage(text);
        }
    });

    if (interviewBtn) {
        interviewBtn.addEventListener('click', startInterview);
    }

    // Initialize welcome screen
    resetChat();
})();
