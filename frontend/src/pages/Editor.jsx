import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { API_BASE } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../App.jsx";

export default function Editor() {
  const { docId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [role, setRole] = useState("viewer");
  const [tab, setTab] = useState("comments");
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [chat, setChat] = useState([]);
  const [presence, setPresence] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [newChat, setNewChat] = useState("");
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState("viewer");
  const [collaborators, setCollaborators] = useState([]);
  const [status, setStatus] = useState("Loading...");

  const saveTimeout = useRef(null);
  const socketRef = useRef(null);
  const remoteUpdate = useRef(false);

  const canEdit = role === "editor" || role === "admin";
  const canAdmin = role === "admin";

  useEffect(() => {
    api.get(`/api/documents/${docId}`).then((res) => {
      const d = res.data.document;
      setDoc(d);
      setTitle(d.title);
      setContent(d.content);
      setRole(d.role);
      setStatus("Synced");
    });
    api.get(`/api/documents/${docId}/comments`).then((res) => setComments(res.data.comments));
    api.get(`/api/documents/${docId}/versions`).then((res) => setVersions(res.data.versions));
    api.get(`/api/documents/${docId}/collaborators`).then((res) => setCollaborators(res.data.collaborators)).catch(() => {});

    const socket = getSocket();
    socketRef.current = socket;
    socket.emit("join_document", { doc_id: docId, user_name: user?.name });

    socket.on("content_update", (data) => {
      remoteUpdate.current = true;
      setContent(data.content);
      setStatus(`Updated by ${data.user_name}`);
    });
    socket.on("document_restored", (data) => {
      remoteUpdate.current = true;
      setContent(data.content);
      setStatus("Version restored");
    });
    socket.on("new_comment", (comment) => {
      setComments((prev) => [...prev, comment]);
    });
    socket.on("chat_message", (msg) => {
      setChat((prev) => [...prev, msg]);
    });
    socket.on("user_joined", (data) => {
      setPresence((prev) => [...prev, data.user_name]);
    });
    socket.on("user_left", (data) => {
      setPresence((prev) => prev.filter((n) => n !== data.user_name));
    });

    return () => {
      socket.emit("leave_document", { doc_id: docId, user_name: user?.name });
      socket.off("content_update");
      socket.off("document_restored");
      socket.off("new_comment");
      socket.off("chat_message");
      socket.off("user_joined");
      socket.off("user_left");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const persist = useCallback(
    (newTitle, newContent) => {
      clearTimeout(saveTimeout.current);
      setStatus("Saving...");
      saveTimeout.current = setTimeout(async () => {
        try {
          await api.put(`/api/documents/${docId}`, { title: newTitle, content: newContent });
          setStatus("Saved");
          api.get(`/api/documents/${docId}/versions`).then((res) => setVersions(res.data.versions));
        } catch (e) {
          setStatus("Save failed");
        }
      }, 800);
    },
    [docId]
  );

  const onContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    if (canEdit) {
      socketRef.current.emit("content_change", { doc_id: docId, content: val, user_name: user?.name });
      persist(title, val);
    }
  };

  const onTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (canEdit) persist(val, content);
  };

  const submitComment = async () => {
    if (!newComment.trim()) return;
    await api.post(`/api/documents/${docId}/comments`, { text: newComment });
    setNewComment("");
  };

  const submitChat = () => {
    if (!newChat.trim()) return;
    const msg = { doc_id: docId, user_name: user?.name, text: newChat, timestamp: new Date().toISOString() };
    socketRef.current.emit("chat_message", msg);
    setNewChat("");
  };

  const restoreVersion = async (versionId) => {
    if (!confirm("Restore this version? Current content will be saved as a new version.")) return;
    await api.post(`/api/documents/${docId}/versions/${versionId}/restore`);
    api.get(`/api/documents/${docId}/versions`).then((res) => setVersions(res.data.versions));
  };

  const addCollaborator = async () => {
    if (!collabEmail.trim()) return;
    try {
      await api.post(`/api/documents/${docId}/collaborators`, { email: collabEmail, role: collabRole });
      setCollabEmail("");
      api.get(`/api/documents/${docId}/collaborators`).then((res) => setCollaborators(res.data.collaborators));
    } catch (e) {
      alert(e.response?.data?.error || "Failed to add collaborator");
    }
  };

  const exportDoc = (fmt) => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/api/documents/${docId}/export/${fmt}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.${fmt}`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
  };

  const deleteDoc = async () => {
    if (!confirm("Delete this document permanently?")) return;
    await api.delete(`/api/documents/${docId}`);
    navigate("/");
  };

  if (!doc) return <div className="container">Loading document...</div>;

  return (
    <div>
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="secondary" onClick={() => navigate("/")}>← Back</button>
          <span className="status-text">{status}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {presence.length > 0 && (
            <span className="status-text">
              <span className="presence-dot"></span>
              {presence.length} online
            </span>
          )}
          <button className="secondary" onClick={() => exportDoc("pdf")}>Export PDF</button>
          <button className="secondary" onClick={() => exportDoc("docx")}>Export Word</button>
          {canAdmin && <button className="secondary" onClick={deleteDoc}>Delete</button>}
        </div>
      </div>

      <div className="editor-shell">
        <div className="editor-main">
          <input
            className="editor-title-input"
            value={title}
            onChange={onTitleChange}
            disabled={!canEdit}
          />
          <textarea
            className="editor-textarea"
            value={content}
            onChange={onContentChange}
            disabled={!canEdit}
            placeholder={canEdit ? "Start typing..." : "You have view-only access"}
          />
        </div>

        <div className="sidebar">
          <div className="sidebar-tabs">
            <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>Comments</button>
            <button className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}>History</button>
            <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Chat</button>
            {canAdmin && <button className={tab === "share" ? "active" : ""} onClick={() => setTab("share")}>Share</button>}
          </div>

          <div className="sidebar-content">
            {tab === "comments" && (
              <>
                {comments.map((c) => (
                  <div key={c.id} className="comment-item">
                    <div className="meta">{c.user_name || c.user_id} · {new Date(c.timestamp).toLocaleString()}</div>
                    <div>{c.text}</div>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <textarea rows={3} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." />
                  <button style={{ marginTop: 8, width: "100%" }} onClick={submitComment}>Comment</button>
                </div>
              </>
            )}

            {tab === "versions" && (
              <>
                {versions.length === 0 && <p className="status-text">No previous versions yet.</p>}
                {versions.map((v) => (
                  <div key={v.id} className="version-item">
                    <div className="meta">{new Date(v.timestamp).toLocaleString()}</div>
                    <button className="secondary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => restoreVersion(v.id)}>
                      Restore
                    </button>
                  </div>
                ))}
              </>
            )}

            {tab === "chat" && (
              <>
                {chat.map((m, i) => (
                  <div key={i} className="chat-item">
                    <div className="meta">{m.user_name} · {new Date(m.timestamp).toLocaleTimeString()}</div>
                    <div>{m.text}</div>
                  </div>
                ))}
                <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                  <input value={newChat} onChange={(e) => setNewChat(e.target.value)} placeholder="Message..." onKeyDown={(e) => e.key === "Enter" && submitChat()} />
                  <button onClick={submitChat}>Send</button>
                </div>
              </>
            )}

            {tab === "share" && canAdmin && (
              <>
                <p className="status-text">Invite by email (must already have an account).</p>
                <div className="field">
                  <input value={collabEmail} onChange={(e) => setCollabEmail(e.target.value)} placeholder="person@email.com" />
                </div>
                <div className="field">
                  <select value={collabRole} onChange={(e) => setCollabRole(e.target.value)}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button style={{ width: "100%" }} onClick={addCollaborator}>Add Collaborator</button>

                <div style={{ marginTop: 16 }}>
                  {collaborators.map((c) => (
                    <div key={c.user_id} className="comment-item">
                      <div>{c.name} <span className="status-text">({c.email})</span></div>
                      <span className="badge">{c.role}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
