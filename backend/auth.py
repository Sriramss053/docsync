import os
import jwt
from functools import wraps
from datetime import datetime, timedelta
from flask import request, jsonify, current_app

from models import db, User, Document, Collaborator

ROLE_RANK = {"viewer": 0, "editor": 1, "admin": 2}


def generate_token(user: User) -> str:
    payload = {
        "user_id": user.id,
        "email": user.email,
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow(),
    }
    secret = current_app.config["JWT_SECRET_KEY"]
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_token(token: str):
    secret = current_app.config["JWT_SECRET_KEY"]
    return jwt.decode(token, secret, algorithms=["HS256"])


def get_token_from_request():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.split(" ", 1)[1]
    return None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            return jsonify({"error": "Missing authorization token"}), 401
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        user = User.query.get(payload["user_id"])
        if not user:
            return jsonify({"error": "User not found"}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = getattr(request, "current_user", None)
        if not user or user.role != "admin":
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)
    return wrapper


def get_doc_role(user: User, document: Document) -> str:
    """Effective role of a user on a specific document."""
    if document.owner_id == user.id or user.role == "admin":
        return "admin"
    collab = Collaborator.query.filter_by(doc_id=document.id, user_id=user.id).first()
    if collab:
        return collab.role
    return None  # no access


def require_doc_role(min_role="viewer"):
    """Decorator factory; expects `doc_id` kwarg in the route, populates request.doc and request.doc_role."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            doc_id = kwargs.get("doc_id")
            document = Document.query.get(doc_id)
            if not document:
                return jsonify({"error": "Document not found"}), 404
            role = get_doc_role(request.current_user, document)
            if role is None or ROLE_RANK[role] < ROLE_RANK[min_role]:
                return jsonify({"error": "Insufficient permissions"}), 403
            request.doc = document
            request.doc_role = role
            return f(*args, **kwargs)
        return wrapper
    return decorator
