from flask import Blueprint, jsonify, request, send_file
from src.models.user import db
from src.models.board import Board, Layout
import ezdxf
import numpy as np
from stl import mesh
import os
import tempfile
import math

board_bp = Blueprint('board', __name__)

@board_bp.route('/boards', methods=['GET'])
def get_boards():
    boards = Board.query.all()
    return jsonify([board.to_dict() for board in boards])

@board_bp.route('/boards', methods=['POST'])
def create_board():
    data = request.json
    board = Board(
        name=data['name'],
        width=data['width'],
        height=data['height'],
        mounting_holes_x=data['mounting_holes_x'],
        mounting_holes_y=data['mounting_holes_y'],
        hole_spacing_x=data['hole_spacing_x'],
        hole_spacing_y=data['hole_spacing_y'],
        hole_diameter=data['hole_diameter'],
        standoff_height=data.get('standoff_height', 10.0),
        position_x=data.get('position_x', 0.0),
        position_y=data.get('position_y', 0.0),
        rotation=data.get('rotation', 0)
    )
    db.session.add(board)
    db.session.commit()
    return jsonify(board.to_dict()), 201

@board_bp.route('/boards/<int:board_id>', methods=['PUT'])
def update_board(board_id):
    board = Board.query.get_or_404(board_id)
    data = request.json
    
    for key, value in data.items():
        if hasattr(board, key):
            setattr(board, key, value)
    
    db.session.commit()
    return jsonify(board.to_dict())

@board_bp.route('/boards/<int:board_id>', methods=['DELETE'])
def delete_board(board_id):
    board = Board.query.get_or_404(board_id)
    db.session.delete(board)
    db.session.commit()
    return '', 204

@board_bp.route('/layouts', methods=['GET'])
def get_layouts():
    layouts = Layout.query.all()
    return jsonify([layout.to_dict() for layout in layouts])

@board_bp.route('/layouts', methods=['POST'])
def create_layout():
    data = request.json
    layout = Layout(
        name=data['name'],
        base_width=data['base_width'],
        base_height=data['base_height']
    )
    db.session.add(layout)
    db.session.commit()
    return jsonify(layout.to_dict()), 201

def generate_dxf(boards, base_width, base_height):
    """Generate DXF file for laser cutting"""
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    
    # Create layers for different elements
    doc.layers.new('BOARD_OUTLINE', dxfattribs={'color': 1})  # Red for board outlines
    doc.layers.new('MOUNTING_HOLES', dxfattribs={'color': 2})  # Yellow for mounting holes
    doc.layers.new('BASE_OUTLINE', dxfattribs={'color': 3})  # Green for base outline
    doc.layers.new('LABELS', dxfattribs={'color': 4})  # Cyan for labels
    
    # Draw base outline
    msp.add_lwpolyline([
        (0, 0),
        (base_width, 0),
        (base_width, base_height),
        (0, base_height),
        (0, 0)
    ], close=True, dxfattribs={'layer': 'BASE_OUTLINE'})
    
    for board in boards:
        # Calculate actual board dimensions considering rotation
        if board.rotation % 180 == 90:
            actual_width = board.height
            actual_height = board.width
        else:
            actual_width = board.width
            actual_height = board.height
        
        # Draw board outline
        x, y = board.position_x, board.position_y
        msp.add_lwpolyline([
            (x, y),
            (x + actual_width, y),
            (x + actual_width, y + actual_height),
            (x, y + actual_height),
            (x, y)
        ], close=True, dxfattribs={'layer': 'BOARD_OUTLINE'})
        
        # Add board label
        msp.add_text(
            board.name,
            dxfattribs={
                'layer': 'LABELS',
                'height': min(actual_width, actual_height) * 0.1
            }
        ).set_pos((x + actual_width/2, y + actual_height/2))
        
        # Calculate mounting hole positions
        holes_x = board.mounting_holes_x
        holes_y = board.mounting_holes_y
        
        if holes_x == 1:
            hole_x_positions = [actual_width / 2]
        else:
            hole_x_positions = [board.hole_spacing_x / 2, actual_width - board.hole_spacing_x / 2]
        
        if holes_y == 1:
            hole_y_positions = [actual_height / 2]
        else:
            hole_y_positions = [board.hole_spacing_y / 2, actual_height - board.hole_spacing_y / 2]
        
        # Draw mounting holes
        for hole_x in hole_x_positions:
            for hole_y in hole_y_positions:
                msp.add_circle(
                    (x + hole_x, y + hole_y),
                    board.hole_diameter / 2,
                    dxfattribs={'layer': 'MOUNTING_HOLES'}
                )
    
    return doc

def generate_standoff_stl(board):
    """Generate STL file for a single standoff"""
    # Standoff parameters
    outer_diameter = board.hole_diameter + 4.0  # 2mm wall thickness
    inner_diameter = board.hole_diameter + 0.2  # 0.1mm clearance
    height = board.standoff_height
    
    # Create cylindrical standoff
    theta = np.linspace(0, 2*np.pi, 32)
    
    # Outer cylinder vertices
    outer_bottom = np.column_stack([
        outer_diameter/2 * np.cos(theta),
        outer_diameter/2 * np.sin(theta),
        np.zeros(len(theta))
    ])
    outer_top = np.column_stack([
        outer_diameter/2 * np.cos(theta),
        outer_diameter/2 * np.sin(theta),
        np.full(len(theta), height)
    ])
    
    # Inner cylinder vertices
    inner_bottom = np.column_stack([
        inner_diameter/2 * np.cos(theta),
        inner_diameter/2 * np.sin(theta),
        np.zeros(len(theta))
    ])
    inner_top = np.column_stack([
        inner_diameter/2 * np.cos(theta),
        inner_diameter/2 * np.sin(theta),
        np.full(len(theta), height)
    ])
    
    # Create faces for the standoff
    faces = []
    n = len(theta)
    
    # Bottom face (ring)
    for i in range(n):
        next_i = (i + 1) % n
        # Outer to inner triangles
        faces.append([outer_bottom[i], inner_bottom[i], outer_bottom[next_i]])
        faces.append([inner_bottom[i], inner_bottom[next_i], outer_bottom[next_i]])
    
    # Top face (ring)
    for i in range(n):
        next_i = (i + 1) % n
        # Outer to inner triangles (reversed for correct normal)
        faces.append([outer_top[i], outer_top[next_i], inner_top[i]])
        faces.append([inner_top[i], outer_top[next_i], inner_top[next_i]])
    
    # Outer wall
    for i in range(n):
        next_i = (i + 1) % n
        faces.append([outer_bottom[i], outer_bottom[next_i], outer_top[i]])
        faces.append([outer_bottom[next_i], outer_top[next_i], outer_top[i]])
    
    # Inner wall (reversed for correct normal)
    for i in range(n):
        next_i = (i + 1) % n
        faces.append([inner_bottom[i], inner_top[i], inner_bottom[next_i]])
        faces.append([inner_bottom[next_i], inner_top[i], inner_top[next_i]])
    
    # Convert to numpy array and create mesh
    faces_array = np.array(faces)
    standoff_mesh = mesh.Mesh(np.zeros(faces_array.shape[0], dtype=mesh.Mesh.dtype))
    for i, face in enumerate(faces_array):
        for j in range(3):
            standoff_mesh.vectors[i][j] = face[j]
    
    return standoff_mesh

@board_bp.route('/generate-dxf', methods=['POST'])
def generate_dxf_file():
    data = request.json
    board_ids = data.get('board_ids', [])
    base_width = data.get('base_width', 100)
    base_height = data.get('base_height', 100)
    
    boards = Board.query.filter(Board.id.in_(board_ids)).all()
    
    if not boards:
        return jsonify({'error': 'No boards found'}), 400
    
    doc = generate_dxf(boards, base_width, base_height)
    
    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp_file:
        doc.saveas(tmp_file.name)
        return send_file(tmp_file.name, as_attachment=True, download_name='rf_board_layout.dxf')

@board_bp.route('/generate-stl/<int:board_id>', methods=['GET'])
def generate_stl_file(board_id):
    board = Board.query.get_or_404(board_id)
    
    standoff_mesh = generate_standoff_stl(board)
    
    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.stl') as tmp_file:
        standoff_mesh.save(tmp_file.name)
        return send_file(tmp_file.name, as_attachment=True, download_name=f'{board.name}_standoff.stl')

@board_bp.route('/preview-layout', methods=['POST'])
def preview_layout():
    """Generate preview data for the layout"""
    data = request.json
    board_ids = data.get('board_ids', [])
    base_width = data.get('base_width', 100)
    base_height = data.get('base_height', 100)
    
    boards = Board.query.filter(Board.id.in_(board_ids)).all()
    
    preview_data = {
        'base_width': base_width,
        'base_height': base_height,
        'boards': []
    }
    
    for board in boards:
        # Calculate actual dimensions considering rotation
        if board.rotation % 180 == 90:
            actual_width = board.height
            actual_height = board.width
        else:
            actual_width = board.width
            actual_height = board.height
        
        # Calculate mounting hole positions
        holes_x = board.mounting_holes_x
        holes_y = board.mounting_holes_y
        
        if holes_x == 1:
            hole_x_positions = [actual_width / 2]
        else:
            hole_x_positions = [board.hole_spacing_x / 2, actual_width - board.hole_spacing_x / 2]
        
        if holes_y == 1:
            hole_y_positions = [actual_height / 2]
        else:
            hole_y_positions = [board.hole_spacing_y / 2, actual_height - board.hole_spacing_y / 2]
        
        holes = []
        for hole_x in hole_x_positions:
            for hole_y in hole_y_positions:
                holes.append({
                    'x': board.position_x + hole_x,
                    'y': board.position_y + hole_y,
                    'diameter': board.hole_diameter
                })
        
        preview_data['boards'].append({
            'id': board.id,
            'name': board.name,
            'x': board.position_x,
            'y': board.position_y,
            'width': actual_width,
            'height': actual_height,
            'rotation': board.rotation,
            'holes': holes
        })
    
    return jsonify(preview_data)

