import sqlite3, json

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

# Get all exhibits with their video info
print("=== ALL EXHIBITS ===")
exhibits = conn.execute("SELECT id, name, code, category, default_language, exhibit_video_filename FROM exhibits").fetchall()
for e in exhibits:
    print(f"  [{e['code']}] {e['name']} lang={e['default_language']} video={e['exhibit_video_filename']}")

print()
print("=== ALL CONTENTS ===")
contents = conn.execute("SELECT id, exhibit_id, title, body, language, status, video_filename FROM contents").fetchall()
for c in contents:
    print(f"  exhibit={c['exhibit_id'][:8]} lang={c['language']} status={c['status']} video={c['video_filename']} title={c['title']}")
