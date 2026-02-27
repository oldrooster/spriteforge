import os

from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_SIZE', 500)) * 1024 * 1024
app.config['UPLOAD_FOLDER'] = '/app/uploads'
app.config['OUTPUT_FOLDER'] = '/app/output'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


from app.routes.upload import upload_bp
from app.routes.extract import extract_bp
from app.routes.export import export_bp

app.register_blueprint(upload_bp, url_prefix='/api')
app.register_blueprint(extract_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')
