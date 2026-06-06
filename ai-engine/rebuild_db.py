# rebuild_db.py
import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import hashlib
import shutil
import time
import gc
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore

from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_core.documents import Document

def release_existing_chroma():
    """Try to release any ChromaDB handles in the current process."""
    try:
        import chromadb
        # Walk all live objects and stop any running Chroma systems
        import gc
        for obj in gc.get_objects():
            if isinstance(obj, chromadb.Client):
                try:
                    obj._system.stop()
                except Exception:
                    pass
    except Exception:
        pass
    gc.collect()

def main():
    release_existing_chroma()   # ← add this as first line
    print("📦 Preparing structured knowledge blocks for vectorizing...")
    ...
    
# ── Config ────────────────────────────────────────────────────
DB_PATH   = "./chroma_db_local"
HASH_FILE = "./chroma_db_local/.kb_fingerprint"

# ── Firestore ─────────────────────────────────────────────────
def init_firestore_client():
    if not firebase_admin._apps:
        cred = credentials.Certificate("firebase_service_account.json")
        firebase_admin.initialize_app(cred)
    return firestore.client()

def load_approved_knowledge_base():
    db = init_firestore_client()
    print("🛰️  Connecting to Firestore 'psm_sections' collection...")
    docs_ref = db.collection("psm_sections").where(
        filter=firestore.FieldFilter("approved", "==", True)   # ← fixes UserWarning
    )
    docs = docs_ref.stream()

    langchain_documents = []
    count = 0

    snapshot_filename = "ai_knowledge_base_snapshot.txt"
    with open(snapshot_filename, "w", encoding="utf-8") as snapshot_file:
        snapshot_file.write(f"Snapshot generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        for doc in docs:
            data = doc.to_dict()
            page_title         = data.get("page_title", "Untitled Page").strip()
            heading            = data.get("heading", "General Information").strip()
            content            = data.get("content", "").strip()
            page_url           = data.get("page_url", "")
            path_str           = data.get("path", "")
            doc_links_list     = data.get("doc_links", [])
            picture_links_list = data.get("picture_links", [])

            doc_links_str     = ", ".join(doc_links_list)     if isinstance(doc_links_list, list) else str(doc_links_list)
            picture_links_str = ", ".join(picture_links_list) if isinstance(picture_links_list, list) else str(picture_links_list)

            if len(content) < 30:
                continue

            count += 1
            formatted_page_content = (
                f"Document Source Title: {page_title}\n"
                f"Section Subheading Anchor: {heading}\n"
                f"Source Citation URL: {page_url}\n"
                f"Verified Context:\n{content}"
            )

            snapshot_file.write(f"--- [CHUNK #{count}] ---\n{formatted_page_content}\n\n")

            langchain_documents.append(Document(
                page_content=formatted_page_content,
                metadata={
                    "id": doc.id, "category": "verified_kb_node",
                    "source": page_url, "path": path_str,
                    "title": page_title, "heading": heading,
                    "downloadable_documents": doc_links_str,
                    "visual_attachments": picture_links_str,
                    "ingested_at": datetime.now().isoformat(),
                }
            ))

    print(f"✅ Retrieved {count} approved sections from Firestore!")
    return langchain_documents

# ── Fingerprint ───────────────────────────────────────────────
def compute_kb_fingerprint():
    db   = init_firestore_client()
    docs = db.collection("psm_sections").where(
        filter=firestore.FieldFilter("approved", "==", True)
    ).stream()
    entries = []
    for doc in docs:
        data = doc.to_dict()
        ts   = str(data.get("updatedAt", "")) or str(data.get("scraped_at", ""))
        entries.append(f"{doc.id}:{ts}")
    entries.sort()
    fp = hashlib.sha256(json.dumps(entries).encode()).hexdigest()
    print(f"🔑 Fingerprint: {fp[:16]}... ({len(entries)} approved docs)")
    return fp, len(entries)

def load_saved_fingerprint():
    try:
        if os.path.exists(HASH_FILE):
            with open(HASH_FILE) as f:
                return f.read().strip()
    except Exception:
        pass
    return ""

def save_fingerprint(fp):
    os.makedirs(os.path.dirname(HASH_FILE), exist_ok=True)
    with open(HASH_FILE, "w") as f:
        f.write(fp)
    print(f"💾 Fingerprint saved: {fp[:16]}...")

# ── Safe DB removal (handles Windows file locks) ──────────────
def safe_remove_db(path, retries=5, delay=2):
    """Delete the Chroma DB folder, retrying if Windows has it locked."""
    for attempt in range(1, retries + 1):
        try:
            shutil.rmtree(path)
            print("🗑️  Old Chroma DB wiped.")
            return
        except PermissionError as e:
            if attempt < retries:
                print(f"⚠️  DB locked by another process — retrying in {delay}s "
                      f"(attempt {attempt}/{retries})...")
                gc.collect()
                time.sleep(delay)
            else:
                raise RuntimeError(
                    f"\n❌ Cannot delete '{path}' after {retries} attempts.\n"
                    f"   A process (app server, notebook, previous rebuild) still holds the files.\n"
                    f"   Run:  Get-Process python | Stop-Process -Force\n"
                    f"   Then retry.  Original error: {e}"
                )

# ── Main rebuild logic ────────────────────────────────────────
def main():
    print("📦 Preparing structured knowledge blocks for vectorizing...")
    raw_docs = load_approved_knowledge_base()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=80, length_function=len
    )
    docs = splitter.split_documents(raw_docs)
    print(f"✅ Total chunk segments after text split: {len(docs)}")

    print("🧠 Loading embedding model (nomic-embed-text)...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")

    current_fp, doc_count = compute_kb_fingerprint()
    saved_fp = load_saved_fingerprint()

    if doc_count == 0:
        print("⚠️  WARNING: Firestore returned 0 approved documents.")
        print("   Check that your 'psm_sections' documents have  approved == true  (boolean, not string).")
        return

    if current_fp and current_fp == saved_fp and os.path.exists(DB_PATH):
        print("✅ No changes detected — Chroma DB is already up to date.")
        return

    print("🔄 Change detected — rebuilding Chroma vector database...")

    # ── Close any open Chroma client before deleting files ────
    vectorstore = None
    gc.collect()

    if os.path.exists(DB_PATH):
        safe_remove_db(DB_PATH)

    if not docs:
        print("⚠️  No approved docs to embed — skipping.")
        return

    BATCH_SIZE = 50
    for i in range(0, len(docs), BATCH_SIZE):
        batch = docs[i:i + BATCH_SIZE]
        if vectorstore is None:
            vectorstore = Chroma.from_documents(
                documents=batch,
                embedding=embeddings,
                persist_directory=DB_PATH,
                collection_name="psm_utm_kb",
            )
        else:
            vectorstore.add_documents(batch)
        print(f"✅ Embedded batch {i // BATCH_SIZE + 1} "
              f"({min(i + BATCH_SIZE, len(docs))}/{len(docs)} segments)")

    # ── Explicitly release client before saving fingerprint ───
    del vectorstore
    gc.collect()

    save_fingerprint(current_fp)
    print("✅ Vector database rebuilt and fingerprint updated.")

if __name__ == "__main__":
    main()