import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../App.jsx";

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadDocs = () => {
    api.get("/api/documents").then((res) => setDocuments(res.data.documents));
  };

  useEffect(() => {
    loadDocs();
    setLoading(false);
  }, []);

  const createDocument = async () => {
    const res = await api.post("/api/documents", { title: "Untitled Document" });
    navigate(`/documents/${res.data.document.id}`);
  };

  return (
    <div>
      <div className="topbar">
        <div className="brand">📄 DocSync</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="status-text">
            {user?.name} · <span style={{ textTransform: "capitalize" }}>{user?.role}</span>
          </span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="container">
        <div className="toolbar-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>My Documents</h2>
          <button onClick={createDocument}>+ New Document</button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : documents.length === 0 ? (
          <div className="card" style={{ marginTop: 20, textAlign: "center", color: "var(--muted)" }}>
            No documents yet. Create your first one!
          </div>
        ) : (
          <div className="doc-grid">
            {documents.map((doc) => (
              <div key={doc.id} className="doc-tile" onClick={() => navigate(`/documents/${doc.id}`)}>
                <div className="title">{doc.title}</div>
                <div className="meta">Updated {new Date(doc.updated_at).toLocaleString()}</div>
                <span className="badge">{doc.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
