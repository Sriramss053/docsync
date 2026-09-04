import uuid
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def gen_uuid():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # Global default role (used when a user isn't explicitly a collaborator on a doc)
    role = db.Column(db.String(20), default="editor")  # admin | editor | viewer
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat(),
        }


class Document(db.Model):
    __tablename__ = "documents"
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    title = db.Column(db.String(255), nullable=False, default="Untitled Document")
    owner_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    folder = db.Column(db.String(255), default="root")
    # Content is stored encrypted at rest (Fernet symmetric encryption)
    content_encrypted = db.Column(db.Text, default="")
    is_sensitive = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions = db.relationship("Version", backref="document", cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="document", cascade="all, delete-orphan")
    collaborators = db.relationship("Collaborator", backref="document", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "owner_id": self.owner_id,
            "folder": self.folder,
            "is_sensitive": self.is_sensitive,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Collaborator(db.Model):
    """Per-document role assignment (Admin/Editor/Viewer)."""
    __tablename__ = "collaborators"
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    doc_id = db.Column(db.String(36), db.ForeignKey("documents.id"), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(20), default="viewer")  # admin | editor | viewer
    __table_args__ = (db.UniqueConstraint("doc_id", "user_id", name="uq_doc_user"),)


class Version(db.Model):
    __tablename__ = "versions"
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    doc_id = db.Column(db.String(36), db.ForeignKey("documents.id"), nullable=False)
    content_encrypted = db.Column(db.Text)
    edited_by = db.Column(db.String(36), db.ForeignKey("users.id"))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "edited_by": self.edited_by,
            "timestamp": self.timestamp.isoformat(),
        }


class Comment(db.Model):
    __tablename__ = "comments"
    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    doc_id = db.Column(db.String(36), db.ForeignKey("documents.id"), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    text = db.Column(db.Text, nullable=False)
    anchor = db.Column(db.String(255), nullable=True)  # optional: text selection / position marker
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "user_id": self.user_id,
            "text": self.text,
            "anchor": self.anchor,
            "timestamp": self.timestamp.isoformat(),
        }
