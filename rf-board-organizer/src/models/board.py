from flask_sqlalchemy import SQLAlchemy
from src.models.user import db

class Board(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    width = db.Column(db.Float, nullable=False)  # X dimension in mm
    height = db.Column(db.Float, nullable=False)  # Y dimension in mm
    mounting_holes_x = db.Column(db.Integer, nullable=False)  # 1 or 2
    mounting_holes_y = db.Column(db.Integer, nullable=False)  # 1 or 2
    hole_spacing_x = db.Column(db.Float, nullable=False)  # spacing in mm
    hole_spacing_y = db.Column(db.Float, nullable=False)  # spacing in mm
    hole_diameter = db.Column(db.Float, nullable=False)  # hole diameter in mm
    standoff_height = db.Column(db.Float, nullable=False, default=10.0)  # standoff height in mm
    
    # Position and rotation for layout
    position_x = db.Column(db.Float, default=0.0)
    position_y = db.Column(db.Float, default=0.0)
    rotation = db.Column(db.Integer, default=0)  # 0, 90, 180, 270 degrees
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'width': self.width,
            'height': self.height,
            'mounting_holes_x': self.mounting_holes_x,
            'mounting_holes_y': self.mounting_holes_y,
            'hole_spacing_x': self.hole_spacing_x,
            'hole_spacing_y': self.hole_spacing_y,
            'hole_diameter': self.hole_diameter,
            'standoff_height': self.standoff_height,
            'position_x': self.position_x,
            'position_y': self.position_y,
            'rotation': self.rotation
        }

class Layout(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    base_width = db.Column(db.Float, nullable=False)  # Base plate width
    base_height = db.Column(db.Float, nullable=False)  # Base plate height
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'base_width': self.base_width,
            'base_height': self.base_height,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

