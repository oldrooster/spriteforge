import os

from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_SIZE', 500)) * 1024 * 1024
app.config['UPLOAD_FOLDER'] = '/app/uploads'
app.config['OUTPUT_FOLDER'] = '/app/output'
app.config['LIBRARY_FOLDER'] = '/app/library'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
os.makedirs(app.config['LIBRARY_FOLDER'], exist_ok=True)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


from app.routes.upload import upload_bp  # noqa: E402
from app.routes.extract import extract_bp
from app.routes.export import export_bp
from app.routes.resize import resize_bp
from app.routes.image_transparent import image_transparent_bp
from app.routes.library import library_bp
from app.routes.ai_generate import ai_generate_bp
from app.routes.ai_animate import ai_animate_bp
from app.routes.ai_music import ai_music_bp
from app.routes.crop import crop_bp
from app.routes.chat import chat_bp

app.register_blueprint(upload_bp, url_prefix='/api')
app.register_blueprint(extract_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')
app.register_blueprint(resize_bp, url_prefix='/api')
app.register_blueprint(image_transparent_bp, url_prefix='/api')
app.register_blueprint(library_bp, url_prefix='/api')
app.register_blueprint(ai_generate_bp, url_prefix='/api')
app.register_blueprint(ai_animate_bp, url_prefix='/api')
app.register_blueprint(ai_music_bp, url_prefix='/api')
app.register_blueprint(crop_bp, url_prefix='/api')
app.register_blueprint(chat_bp, url_prefix='/api')

# Bootstrap default project on startup
with app.app_context():
    from app.routes.library import ensure_default_project
    ensure_default_project()
