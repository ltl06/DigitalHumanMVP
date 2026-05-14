import sqlite3

conn = sqlite3.connect('history.db')
conn.execute("UPDATE exhibits SET default_language = 'zh-CN' WHERE id = 'a6100e9e6f8c4d2eac2edd4a53cd9f79'")
conn.commit()
print("Updated:杜甫草堂 default_language -> zh-CN")

# Show current state
rows = conn.execute("SELECT id, name, code, default_language, exhibit_video_filename FROM exhibits").fetchall()
for r in rows:
    print(r)
