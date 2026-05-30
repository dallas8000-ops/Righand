from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, UserCategory
import uuid
import re

categories_bp = Blueprint('categories', __name__, url_prefix='/api/categories')


def _slugify(value):
    slug = value.strip().lower()
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    return slug


@categories_bp.route('', methods=['GET'])
@jwt_required()
def list_categories():
    user_id = get_jwt_identity()
    categories = UserCategory.query.filter_by(user_id=user_id).order_by(
        UserCategory.label.asc()
    ).all()
    return jsonify({
        'success': True,
        'categories': [c.to_dict() for c in categories]
    }), 200


@categories_bp.route('', methods=['POST'])
@jwt_required()
def create_category():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    label = (data.get('label') or '').strip()
    if not label:
        return jsonify({'error': 'label is required'}), 400

    value = _slugify(data.get('value') or label)
    if not value:
        return jsonify({'error': 'invalid category name'}), 400

    existing = UserCategory.query.filter_by(user_id=user_id, value=value).first()
    if existing:
        return jsonify({'success': True, 'category': existing.to_dict()}), 200

    entry_type = data.get('entryType', 'expense')
    if entry_type not in ('expense', 'income', 'both'):
        entry_type = 'expense'

    category = UserCategory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        value=value,
        label=label,
        entry_type=entry_type
    )
    db.session.add(category)
    db.session.commit()
    return jsonify({'success': True, 'category': category.to_dict()}), 201


@categories_bp.route('/<category_id>', methods=['DELETE'])
@jwt_required()
def delete_category(category_id):
    user_id = get_jwt_identity()
    category = UserCategory.query.get(category_id)
    if not category or category.user_id != user_id:
        return jsonify({'error': 'Category not found'}), 404
    db.session.delete(category)
    db.session.commit()
    return jsonify({'success': True}), 200
