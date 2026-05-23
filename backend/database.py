import sqlite3
import random
import string
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "pact.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            session_id TEXT,
            product TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            total REAL DEFAULT 0,
            delivery_speed TEXT DEFAULT 'standard',
            status TEXT DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            event TEXT NOT NULL,
            details TEXT,
            privacy_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS agent_sessions (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()


def _gen_order_id() -> str:
    return "PACT-" + "".join(random.choices("0123456789ABCDEF", k=6))


def get_orders(agent_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM orders WHERE agent_id = ? ORDER BY created_at DESC",
        (agent_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_order(data: dict) -> dict:
    conn = get_conn()
    order_id = _gen_order_id()
    conn.execute(
        """INSERT INTO orders (id, agent_id, session_id, product, quantity, total, delivery_speed, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            order_id,
            data["agent_id"],
            data.get("session_id"),
            data["product"],
            data.get("quantity", 1),
            data.get("total", 0.0),
            data.get("delivery_speed", "standard"),
            data.get("status", "confirmed"),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    conn.close()
    return dict(row)


def log_activity(data: dict) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO activity_log (agent_id, event, details, privacy_type, created_at) VALUES (?, ?, ?, ?, ?)",
        (
            data["agent_id"],
            data["event"],
            data.get("details"),
            data.get("privacy_type"),
            data.get("created_at", datetime.now().isoformat()),
        ),
    )
    conn.commit()
    conn.close()


def get_activity(agent_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM activity_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50",
        (agent_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_sessions(agent_id: str) -> int:
    conn = get_conn()
    row = conn.execute(
        "SELECT COUNT(*) FROM agent_sessions WHERE agent_id = ?", (agent_id,)
    ).fetchone()
    conn.close()
    return row[0]


def register_session(session_id: str, agent_id: str) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO agent_sessions (id, agent_id) VALUES (?, ?)",
        (session_id, agent_id),
    )
    conn.commit()
    conn.close()


def seed_agent_data(agent_id: str, agent_card: dict) -> None:
    products = agent_card.get("products", [
        {"name": "Table Reservation", "price": 0.0},
        {"name": "Private Dining Experience", "price": 150.0},
        {"name": "Tasting Menu", "price": 95.0},
        {"name": "Wine Pairing", "price": 45.0},
    ])

    statuses = ["confirmed", "processing", "completed", "confirmed", "processing"]
    speeds = ["standard", "express", "standard", "overnight", "standard"]

    conn = get_conn()

    for i in range(5):
        product = random.choice(products)
        qty = random.randint(1, 3)
        price = float(product.get("price", random.randint(20, 120)))
        total = round(qty * price, 2)
        offset = timedelta(days=random.randint(0, 7), hours=random.randint(0, 23))
        created_at = (datetime.now() - offset).isoformat()
        order_id = _gen_order_id()
        conn.execute(
            """INSERT OR IGNORE INTO orders
               (id, agent_id, product, quantity, total, delivery_speed, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (order_id, agent_id, product.get("name", "Reservation"),
             qty, total, speeds[i], statuses[i], created_at),
        )

    events = [
        ("handshake_initiated", "Personal agent connected", None, 48),
        ("field_classified",    "date, party_size → AI-safe", None, 47),
        ("field_classified",    "email, phone → encrypted",   None, 47),
        ("ai_safe_sent",        "Sent date, party_size to assistant", "ai_safe",   46),
        ("encrypted_direct",    "full_name bypassed AI",   "encrypted", 46),
        ("encrypted_direct",    "email bypassed AI",       "encrypted", 45),
        ("encrypted_direct",    "phone bypassed AI",       "encrypted", 45),
        ("order_confirmed",     "Reservation completed",   "ai_safe",   44),
    ]
    for event, details, privacy_type, hours_ago in events:
        created_at = (datetime.now() - timedelta(hours=hours_ago)).isoformat()
        conn.execute(
            "INSERT INTO activity_log (agent_id, event, details, privacy_type, created_at) VALUES (?, ?, ?, ?, ?)",
            (agent_id, event, details, privacy_type, created_at),
        )

    conn.commit()
    conn.close()
