import os
import json
import uuid

from flask import Blueprint, request, jsonify, current_app

from app.services.ai_client import get_client

chat_bp = Blueprint('chat', __name__)

CHAT_MODEL = 'gemini-2.5-flash'

SYSTEM_PROMPT = """You are a creative assistant for a game asset creation tool called SpriteForge. Your role is to help users craft the perfect prompts for generating game art assets (sprites, backgrounds, objects, UI elements) using AI image generation.

You are knowledgeable about:
- Pixel art styles (retro, modern, isometric)
- Game art categories (characters, environments, items, UI)
- Art direction terminology (color palettes, lighting, perspective)
- Animation-friendly sprite design (clear silhouettes, consistent proportions)

Keep responses concise and focused on helping the user create better generation prompts. When you have enough information, provide a final prompt the user can copy and use directly.

Do NOT use markdown formatting (no **, no ##, no bullet points with *). Use plain text only. Use line breaks for separation."""

INTERVIEW_SYSTEM_PROMPT = """You are a creative assistant for a game asset creation tool called SpriteForge. You are interviewing the user to help them figure out what game art asset they want to generate.

IMPORTANT RULES:
1. Ask ONE question at a time
2. Provide 3-4 concrete options for each question as a JSON array
3. Keep questions focused and progressive - start broad, get specific
4. After 4-6 questions, provide a final generation prompt

You MUST respond in this exact JSON format:
{
  "message": "Your question or message text here (plain text, no markdown)",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "done": false
}

When you have enough info to create a prompt, set done=true and put the final prompt in "message" with "prompt" containing just the generation prompt:
{
  "message": "Here is your generation prompt based on your choices:",
  "prompt": "The actual prompt text to use for generation",
  "options": [],
  "done": true
}

Question flow:
1. What type of asset? (Character, Background/Environment, Object/Item, UI Element)
2. Based on type, ask style/theme
3. Ask about specific details (pose, colors, mood)
4. Ask about technical requirements (resolution feel, transparency needs)
5. Ask if they want to incorporate their project art style
6. Generate the final prompt

Do NOT use markdown formatting. Use plain text only."""



def _session_dir(session_id):
    out = os.path.join(current_app.config['OUTPUT_FOLDER'], 'chat', session_id)
    os.makedirs(out, exist_ok=True)
    return out


def _read_history(session_dir):
    path = os.path.join(session_dir, 'history.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def _save_history(session_dir, history):
    path = os.path.join(session_dir, 'history.json')
    with open(path, 'w') as f:
        json.dump(history, f)


@chat_bp.route('/chat', methods=['POST'])
def chat():
    data = request.get_json(force=True)
    message = (data.get('message') or '').strip()
    session_id = data.get('session_id') or str(uuid.uuid4())
    mode = data.get('mode', 'chat')  # 'chat' or 'interview'
    art_style = data.get('art_style', '')

    if not message and mode != 'interview':
        return jsonify({'error': 'Message is required'}), 400

    client, err = get_client(location='global')
    if err:
        return err

    sdir = _session_dir(session_id)
    history = _read_history(sdir)

    # Build system instruction
    if mode == 'interview':
        sys_prompt = INTERVIEW_SYSTEM_PROMPT
        if art_style:
            sys_prompt += f"\n\nThe user's project art style is: \"{art_style}\". When asking about incorporating art style (around question 5), reference this specific style."
    else:
        sys_prompt = SYSTEM_PROMPT
        if art_style:
            sys_prompt += f"\n\nThe user's project art style setting is: \"{art_style}\". You may reference or incorporate this when helping craft prompts."

    # Build conversation contents for Gemini
    from google.genai import types

    contents = []
    for entry in history:
        role = 'user' if entry['role'] == 'user' else 'model'
        contents.append(types.Content(role=role, parts=[types.Part(text=entry['text'])]))

    # Add new user message
    if message:
        contents.append(types.Content(role='user', parts=[types.Part(text=message)]))
        history.append({'role': 'user', 'text': message})
    elif mode == 'interview' and len(history) == 0:
        # Start interview with an initial prompt
        start_msg = "Start the interview. Ask me your first question about what kind of game asset I want to create."
        contents.append(types.Content(role='user', parts=[types.Part(text=start_msg)]))
        history.append({'role': 'user', 'text': start_msg})

    try:
        response = client.models.generate_content(
            model=CHAT_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=sys_prompt,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        )

        reply_text = response.text or ''

        history.append({'role': 'assistant', 'text': reply_text})
        _save_history(sdir, history)

        # Try to parse interview JSON response
        result = {
            'session_id': session_id,
            'reply': reply_text,
            'mode': mode,
        }

        if mode == 'interview':
            try:
                # Strip markdown code fences if present
                cleaned = reply_text.strip()
                if cleaned.startswith('```'):
                    cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
                    if cleaned.endswith('```'):
                        cleaned = cleaned[:-3]
                    cleaned = cleaned.strip()
                parsed = json.loads(cleaned)
                result['structured'] = parsed
            except (json.JSONDecodeError, ValueError):
                # Fall back to plain text
                pass

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/chat/reset', methods=['POST'])
def reset_chat():
    data = request.get_json(force=True)
    session_id = data.get('session_id')
    if session_id:
        sdir = _session_dir(session_id)
        hist_path = os.path.join(sdir, 'history.json')
        if os.path.exists(hist_path):
            os.remove(hist_path)
    return jsonify({'ok': True})
