import sqlite3
import os

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

exhibits = conn.execute("SELECT id, name, exhibit_video_filename FROM exhibits WHERE exhibit_video_filename != ''").fetchall()
contents = conn.execute("SELECT id, exhibit_id, title, video_filename FROM contents WHERE video_filename != ''").fetchall()
print('Exhibits with video:', [dict(r) for r in exhibits])
print('Contents with video:', [dict(r) for r in contents])

uploads = r'D:\hecheng\DigitalHumanMVP\backend\uploads'
outputs = r'D:\hecheng\DigitalHumanMVP\backend\outputs'
print('Uploads exists:', os.path.exists(uploads))
if os.path.exists(uploads):
    files = []
    for root, dirs, filenames in os.walk(uploads):
        for f in filenames:
            files.append(os.path.join(root, f))
    print('Uploads files:', files)
print('Outputs exists:', os.path.exists(outputs))
if os.path.exists(outputs):
    files = []
    for root, dirs, filenames in os.walk(outputs):
        for f in filenames:
            files.append(os.path.join(root, f))
    print('Outputs files:', files)
