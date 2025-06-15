from flask import Blueprint, jsonify, request, send_file
from src.models.board import Board, Layout, db
import ezdxf
import numpy as np
from stl import mesh
import os
import tempfile
import math
import google.generativeai as genai
import json
import re
from werkzeug.utils import secure_filename
import dotenv

dotenv.load_dotenv()

board_bp = Blueprint('board', __name__)

# Configure Gemini API (you'll need to set the API key)
# For now, we'll use a placeholder - in production, this should be an environment variable
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if GOOGLE_API_KEY != 'YOUR_GOOGLE_API_KEY_HERE':
    genai.configure(api_key=GOOGLE_API_KEY)

@board_bp.route('/boards', methods=['GET'])
def get_boards():
    boards = Board.query.all()
    return jsonify([{
        'id': board.id,
        'name': board.name,
        'width': board.width,
        'height': board.height,
        'mounting_holes_x': board.mounting_holes_x,
        'mounting_holes_y': board.mounting_holes_y,
        'hole_spacing_x': board.hole_spacing_x,
        'hole_spacing_y': board.hole_spacing_y,
        'hole_diameter': board.hole_diameter,
        'standoff_height': board.standoff_height
    } for board in boards])

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
        standoff_height=data.get('standoff_height', 10)
    )
    db.session.add(board)
    db.session.commit()
    return jsonify({'id': board.id}), 201

@board_bp.route('/boards/<int:board_id>', methods=['DELETE'])
def delete_board(board_id):
    board = Board.query.get_or_404(board_id)
    db.session.delete(board)
    db.session.commit()
    return '', 204

@board_bp.route('/extract-dimensions', methods=['POST'])
def extract_dimensions():
    """Extract board dimensions from uploaded image using Gemini API"""
    
    if GOOGLE_API_KEY == 'YOUR_GOOGLE_API_KEY_HERE':
        return jsonify({
            'success': False,
            'error': 'Google API key not configured. Please set the GOOGLE_API_KEY environment variable.'
        }), 500
    
    try:
        # Check if image file is present
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image file provided'
            }), 400
        
        image_file = request.files['image']
        user_prompt = request.form.get('prompt', '')
        
        if image_file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No image file selected'
            }), 400
        
        # Save the uploaded file temporarily
        filename = secure_filename(image_file.filename)
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, filename)
        image_file.save(temp_path)
        
        try:
            # Upload file to Gemini
            uploaded_file = genai.upload_file(temp_path)
            
            # Create a comprehensive prompt for dimension extraction
            system_prompt = """
You are an expert at analyzing technical drawings and dimensional diagrams of electronic circuit boards and RF modules. 

Analyze this image and extract the following information:
1. Board/module name or identifier
2. Overall board dimensions (width and height in mm)
3. Number of mounting holes in X direction (1 or 2)
4. Number of mounting holes in Y direction (1 or 2) 
5. Mounting hole spacing in X direction (center-to-center distance in mm)
6. Mounting hole spacing in Y direction (center-to-center distance in mm)
7. Mounting hole diameter (in mm)

User's additional context: """ + user_prompt + """

Please respond with a JSON object in this exact format:
{
  "name": "Board Name",
  "width": 50.0,
  "height": 30.0,
  "mounting_holes_x": 2,
  "mounting_holes_y": 2,
  "hole_spacing_x": 40.0,
  "hole_spacing_y": 20.0,
  "hole_diameter": 3.0,
  "standoff_height": 10.0
}

Important notes:
- All dimensions should be in millimeters
- mounting_holes_x and mounting_holes_y should be 1 or 2 only
- If only 1 hole in a direction, set the spacing for that direction to 0.0
- If you cannot determine a value, use reasonable defaults for RF circuit boards
- Ensure the JSON is valid and properly formatted
"""
            
            # Generate content using Gemini
            model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
            response = model.generate_content([uploaded_file, system_prompt])
            
            # Parse the response
            response_text = response.text.strip()
            
            # Try to extract JSON from the response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                dimensions = json.loads(json_str)
                
                # Validate the extracted dimensions
                required_fields = ['name', 'width', 'height', 'mounting_holes_x', 'mounting_holes_y', 
                                 'hole_spacing_x', 'hole_spacing_y', 'hole_diameter']
                
                for field in required_fields:
                    if field not in dimensions:
                        raise ValueError(f"Missing required field: {field}")
                
                # Ensure numeric fields are properly typed
                numeric_fields = ['width', 'height', 'hole_spacing_x', 'hole_spacing_y', 
                                'hole_diameter', 'standoff_height']
                for field in numeric_fields:
                    if field in dimensions:
                        dimensions[field] = float(dimensions[field])
                
                # Ensure integer fields are properly typed
                int_fields = ['mounting_holes_x', 'mounting_holes_y']
                for field in int_fields:
                    if field in dimensions:
                        dimensions[field] = int(dimensions[field])
                        # Validate hole counts
                        if dimensions[field] not in [1, 2]:
                            dimensions[field] = 2  # Default to 2 if invalid
                
                # Set default standoff height if not provided
                if 'standoff_height' not in dimensions:
                    dimensions['standoff_height'] = 3.0
                
                return jsonify({
                    'success': True,
                    'dimensions': dimensions,
                    'raw_response': response_text
                })
            else:
                raise ValueError("Could not extract valid JSON from Gemini response")
                
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f"Error processing with Gemini API: {str(e)}",
                'raw_response': response.text if 'response' in locals() else None
            }), 500
            
        finally:
            # Clean up temporary file
            try:
                os.remove(temp_path)
                os.rmdir(temp_dir)
            except:
                pass
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f"Server error: {str(e)}"
        }), 500

@board_bp.route('/generate-dxf', methods=['POST'])
def generate_dxf():
    """Generate DXF file for laser cutting"""
    try:
        data = request.json
        boards = data.get('boards', [])
        base_width = data.get('base_width', 200)
        base_height = data.get('base_height', 150)
        
        # Create DXF document
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        
        # Create layers
        doc.layers.new('BOARD_OUTLINE', dxfattribs={'color': 1})  # Red
        doc.layers.new('MOUNTING_HOLES', dxfattribs={'color': 2})  # Yellow
        doc.layers.new('BOARD_LABELS', dxfattribs={'color': 3})  # Green
        doc.layers.new('BASE_OUTLINE', dxfattribs={'color': 4})  # Cyan
        
        # Add base plate outline
        msp.add_lwpolyline([
            (0, 0), (base_width, 0), (base_width, base_height), (0, base_height), (0, 0)
        ], dxfattribs={'layer': 'BASE_OUTLINE'})
        
        # Add boards
        for board in boards:
            x, y = board['x'], board['y']
            width, height = board['width'], board['height']
            
            # Board outline
            msp.add_lwpolyline([
                (x, y), (x + width, y), (x + width, y + height), (x, y + height), (x, y)
            ], dxfattribs={'layer': 'BOARD_OUTLINE'})
            
            # Board label
            msp.add_text(board['name'], dxfattribs={
                'layer': 'BOARD_LABELS',
                'height': 5,
                'insert': (x + width/2, y + height/2)
            })
            
            # Mounting holes
            for hole in board.get('holes', []):
                msp.add_circle((hole['x'], hole['y']), hole['diameter']/2, 
                             dxfattribs={'layer': 'MOUNTING_HOLES'})
        
        # Save to temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.dxf')
        doc.saveas(temp_file.name)
        temp_file.close()
        
        return send_file(temp_file.name, as_attachment=True, 
                        download_name='rf_board_layout.dxf', mimetype='application/dxf')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@board_bp.route('/generate-stl/<board_name>', methods=['POST'])
def generate_stl(board_name):
    """Generate STL file for board standoffs"""
    try:
        data = request.json
        hole_diameter = data.get('hole_diameter', 3.0)
        standoff_height = data.get('standoff_height', 3.0)
        
        # Create cylindrical standoff with hollow center
        inner_radius = hole_diameter / 2
        outer_radius = inner_radius * 1.5  # 1.5x bigger outer diameter
        
        # Generate mesh for hollow cylinder
        vertices = []
        faces = []
        
        # Number of segments for the cylinder
        segments = 16
        
        # Generate vertices
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            
            # Outer vertices
            x_outer = outer_radius * math.cos(angle)
            y_outer = outer_radius * math.sin(angle)
            
            # Inner vertices  
            x_inner = inner_radius * math.cos(angle)
            y_inner = inner_radius * math.sin(angle)
            
            # Bottom vertices
            vertices.extend([
                [x_outer, y_outer, 0],  # outer bottom
                [x_inner, y_inner, 0]   # inner bottom
            ])
            
            # Top vertices
            vertices.extend([
                [x_outer, y_outer, standoff_height],  # outer top
                [x_inner, y_inner, standoff_height]   # inner top
            ])
        
        vertices = np.array(vertices)
        
        # Generate faces
        face_list = []
        
        for i in range(segments):
            next_i = (i + 1) % segments
            
            # Indices for current and next segment
            curr_outer_bottom = i * 4
            curr_inner_bottom = i * 4 + 1
            curr_outer_top = i * 4 + 2
            curr_inner_top = i * 4 + 3
            
            next_outer_bottom = next_i * 4
            next_inner_bottom = next_i * 4 + 1
            next_outer_top = next_i * 4 + 2
            next_inner_top = next_i * 4 + 3
            
            # Outer wall (2 triangles)
            face_list.extend([
                [curr_outer_bottom, next_outer_bottom, curr_outer_top],
                [next_outer_bottom, next_outer_top, curr_outer_top]
            ])
            
            # Inner wall (2 triangles, reversed winding)
            face_list.extend([
                [curr_inner_bottom, curr_inner_top, next_inner_bottom],
                [next_inner_bottom, curr_inner_top, next_inner_top]
            ])
            
            # Bottom ring (2 triangles)
            face_list.extend([
                [curr_outer_bottom, curr_inner_bottom, next_outer_bottom],
                [next_outer_bottom, curr_inner_bottom, next_inner_bottom]
            ])
            
            # Top ring (2 triangles)
            face_list.extend([
                [curr_outer_top, next_outer_top, curr_inner_top],
                [next_outer_top, next_inner_top, curr_inner_top]
            ])
        
        faces = np.array(face_list)
        
        # Create mesh
        standoff_mesh = mesh.Mesh(np.zeros(faces.shape[0], dtype=mesh.Mesh.dtype))
        for i, face in enumerate(faces):
            for j in range(3):
                standoff_mesh.vectors[i][j] = vertices[face[j], :]
        
        # Save to temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.stl')
        standoff_mesh.save(temp_file.name)
        temp_file.close()
        
        return send_file(temp_file.name, as_attachment=True,
                        download_name=f'{board_name}_standoff.stl', mimetype='application/sla')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@board_bp.route('/generate-l-bracket/<board_name>', methods=['POST'])
def generate_l_bracket(board_name):
    """Generate STL file for L-brackets for boards without mounting holes"""
    try:
        data = request.json
        board_width = data.get('board_width', 50.0)
        board_height = data.get('board_height', 30.0)
        standoff_height = data.get('standoff_height', 10.0)
        
        # L-bracket parameters
        bracket_thickness = 3.0  # 3mm thick brackets
        bracket_width = 10.0     # 10mm wide brackets
        hole_diameter = 3.0      # Standard mounting hole diameter
        hole_offset = 5.0        # Distance from edge to hole center
        
        # Create 4 L-brackets (one for each corner)
        all_vertices = []
        all_faces = []
        vertex_offset = 0
        
        # Define the 4 corner positions
        corners = [
            {'x': 0, 'y': 0, 'name': 'bottom_left'},
            {'x': board_width, 'y': 0, 'name': 'bottom_right'},
            {'x': board_width, 'y': board_height, 'name': 'top_right'},
            {'x': 0, 'y': board_height, 'name': 'top_left'}
        ]
        
        for corner in corners:
            # Generate L-bracket geometry for this corner
            bracket_vertices, bracket_faces = generate_l_bracket_geometry(
                corner['x'], corner['y'], corner['name'],
                bracket_thickness, bracket_width, standoff_height,
                hole_diameter, hole_offset
            )
            
            # Adjust face indices to account for previous vertices
            adjusted_faces = bracket_faces + vertex_offset
            
            all_vertices.extend(bracket_vertices)
            all_faces.extend(adjusted_faces)
            vertex_offset += len(bracket_vertices)
        
        # Convert to numpy arrays
        vertices = np.array(all_vertices)
        faces = np.array(all_faces)
        
        # Create mesh
        l_bracket_mesh = mesh.Mesh(np.zeros(faces.shape[0], dtype=mesh.Mesh.dtype))
        for i, face in enumerate(faces):
            for j in range(3):
                l_bracket_mesh.vectors[i][j] = vertices[face[j], :]
        
        # Save to temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.stl')
        l_bracket_mesh.save(temp_file.name)
        temp_file.close()
        
        return send_file(temp_file.name, as_attachment=True,
                        download_name=f'{board_name}_l_brackets.stl', mimetype='application/sla')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def generate_l_bracket_geometry(corner_x, corner_y, corner_name, thickness, width, height, hole_diameter, hole_offset):
    """Generate geometry for a single L-bracket at a specific corner"""
    vertices = []
    faces = []
    
    # Define L-bracket shape based on corner position
    if corner_name == 'bottom_left':
        # L-bracket extends right and up from corner
        base_points = [
            [corner_x - thickness, corner_y - thickness],  # Outer corner
            [corner_x + width, corner_y - thickness],      # Right edge of horizontal arm
            [corner_x + width, corner_y],                  # Inner corner of horizontal arm
            [corner_x, corner_y],                          # Board corner
            [corner_x, corner_y + width],                  # Inner corner of vertical arm
            [corner_x - thickness, corner_y + width]       # Top edge of vertical arm
        ]
        hole_pos = [corner_x + hole_offset, corner_y + hole_offset]
        
    elif corner_name == 'bottom_right':
        # L-bracket extends left and up from corner
        base_points = [
            [corner_x + thickness, corner_y - thickness],  # Outer corner
            [corner_x - width, corner_y - thickness],      # Left edge of horizontal arm
            [corner_x - width, corner_y],                  # Inner corner of horizontal arm
            [corner_x, corner_y],                          # Board corner
            [corner_x, corner_y + width],                  # Inner corner of vertical arm
            [corner_x + thickness, corner_y + width]       # Top edge of vertical arm
        ]
        hole_pos = [corner_x - hole_offset, corner_y + hole_offset]
        
    elif corner_name == 'top_right':
        # L-bracket extends left and down from corner
        base_points = [
            [corner_x + thickness, corner_y + thickness],  # Outer corner
            [corner_x - width, corner_y + thickness],      # Left edge of horizontal arm
            [corner_x - width, corner_y],                  # Inner corner of horizontal arm
            [corner_x, corner_y],                          # Board corner
            [corner_x, corner_y - width],                  # Inner corner of vertical arm
            [corner_x + thickness, corner_y - width]       # Bottom edge of vertical arm
        ]
        hole_pos = [corner_x - hole_offset, corner_y - hole_offset]
        
    else:  # top_left
        # L-bracket extends right and down from corner
        base_points = [
            [corner_x - thickness, corner_y + thickness],  # Outer corner
            [corner_x + width, corner_y + thickness],      # Right edge of horizontal arm
            [corner_x + width, corner_y],                  # Inner corner of horizontal arm
            [corner_x, corner_y],                          # Board corner
            [corner_x, corner_y - width],                  # Inner corner of vertical arm
            [corner_x - thickness, corner_y - width]       # Bottom edge of vertical arm
        ]
        hole_pos = [corner_x + hole_offset, corner_y - hole_offset]
    
    # Create 3D vertices (bottom and top faces)
    for point in base_points:
        vertices.append([point[0], point[1], 0])        # Bottom face
        vertices.append([point[0], point[1], height])   # Top face
    
    # Generate faces for the L-bracket
    num_points = len(base_points)
    
    # Bottom face (triangulated)
    for i in range(1, num_points - 1):
        faces.append([0, i * 2, (i + 1) * 2])
    
    # Top face (triangulated, reversed winding)
    for i in range(1, num_points - 1):
        faces.append([1, (i + 1) * 2 + 1, i * 2 + 1])
    
    # Side faces
    for i in range(num_points):
        next_i = (i + 1) % num_points
        
        # Two triangles per side face
        faces.append([i * 2, next_i * 2, i * 2 + 1])
        faces.append([next_i * 2, next_i * 2 + 1, i * 2 + 1])
    
    # Create hole by subtracting a cylinder (simplified approach)
    # For now, we'll create the bracket without the hole and let the user drill it
    # In a more advanced implementation, we could subtract a cylindrical mesh
    
    return vertices, faces

