import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Download, RotateCw, Trash2, Move, Upload, FileText, Copy, Camera, AlertCircle } from 'lucide-react';
import './App.css';

function App() {
  const [boards, setBoards] = useState([
    // Sample data
    {
      id: 1,
      name: 'RF Amplifier',
      width: 50,
      height: 30,
      mounting_holes_x: 2,
      mounting_holes_y: 2,
      hole_spacing_x: 40,
      hole_spacing_y: 20,
      hole_diameter: 3,
      standoff_height: 3,
      position_x: 20,
      position_y: 20,
      rotation: 0
    },
    {
      id: 2,
      name: 'Filter Module',
      width: 35,
      height: 25,
      mounting_holes_x: 2,
      mounting_holes_y: 1,
      hole_spacing_x: 25,
      hole_spacing_y: 0,
      hole_diameter: 2.5,
      standoff_height: 8,
      position_x: 80,
      position_y: 60,
      rotation: 90
    }
  ]);
  
  const [selectedBoards, setSelectedBoards] = useState([1, 2]);
  const [baseWidth, setBaseWidth] = useState(200);
  const [baseHeight, setBaseHeight] = useState(150);
  const [previewData, setPreviewData] = useState(null);
  const [draggedBoard, setDraggedBoard] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [jsonInput, setJsonInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  
  // Form state for new board
  const [newBoard, setNewBoard] = useState({
    name: '',
    width: 50,
    height: 30,
    mounting_holes_x: 2,
    mounting_holes_y: 2,
    hole_spacing_x: 40,
    hole_spacing_y: 20,
    hole_diameter: 3,
    standoff_height: 3
  });

  // Calculate actual board dimensions considering rotation
  const getActualDimensions = (board) => {
    if (board.rotation % 180 === 90) {
      return { width: board.height, height: board.width };
    }
    return { width: board.width, height: board.height };
  };

  // Calculate mounting hole positions with proper rotation handling
  const getMountingHoles = (board) => {
    const holes = [];
    const holesX = board.mounting_holes_x;
    const holesY = board.mounting_holes_y;
    
    // Calculate hole positions relative to board center
    const centerX = board.width / 2;
    const centerY = board.height / 2;
    
    // Calculate hole positions in the original (unrotated) coordinate system
    let xPositions, yPositions;
    
    if (holesX === 1) {
      xPositions = [0]; // Relative to center
    } else {
      const halfSpacingX = board.hole_spacing_x / 2;
      xPositions = [-halfSpacingX, halfSpacingX];
    }
    
    if (holesY === 1) {
      yPositions = [0]; // Relative to center
    } else {
      const halfSpacingY = board.hole_spacing_y / 2;
      yPositions = [-halfSpacingY, halfSpacingY];
    }
    
    // Generate holes and apply rotation
    for (const relX of xPositions) {
      for (const relY of yPositions) {
        let holeX = relX;
        let holeY = relY;
        
        // Apply rotation around center
        if (board.rotation !== 0) {
          const rad = (board.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          
          const rotatedX = holeX * cos - holeY * sin;
          const rotatedY = holeX * sin + holeY * cos;
          
          holeX = rotatedX;
          holeY = rotatedY;
        }
        
        // Convert to absolute coordinates
        const { width: actualWidth, height: actualHeight } = getActualDimensions(board);
        holes.push({
          x: board.position_x + actualWidth / 2 + holeX,
          y: board.position_y + actualHeight / 2 + holeY,
          diameter: board.hole_diameter
        });
      }
    }
    
    return holes;
  };

  // Generate preview data
  const generatePreviewData = () => {
    const selectedBoardsData = boards.filter(board => selectedBoards.includes(board.id));
    
    const previewBoards = selectedBoardsData.map(board => {
      const { width, height } = getActualDimensions(board);
      const holes = getMountingHoles(board);
      
      return {
        id: board.id,
        name: board.name,
        x: board.position_x,
        y: board.position_y,
        width,
        height,
        rotation: board.rotation,
        holes,
        originalBoard: board // Keep reference to original board data
      };
    });
    
    setPreviewData({
      base_width: baseWidth,
      base_height: baseHeight,
      boards: previewBoards
    });
  };

  // Import components from JSON
  const importFromJSON = () => {
    try {
      const data = JSON.parse(jsonInput);
      
      if (data.components && Array.isArray(data.components)) {
        const newBoards = data.components.map((component, index) => {
          const newId = Math.max(...boards.map(b => b.id), 0) + index + 1;
          
          return {
            id: newId,
            name: component.id || `Component ${newId}`,
            width: component.width || 50,
            height: component.height || 30,
            mounting_holes_x: component.mounting_holes_x || 2,
            mounting_holes_y: component.mounting_holes_y || 2,
            hole_spacing_x: component.mounting_hole_dx || 40,
            hole_spacing_y: component.mounting_hole_dy || 20,
            hole_diameter: component.mounting_hole_diameter || 3,
            standoff_height: 3, // Default standoff height
            position_x: 10 + (index % 5) * 60, // Arrange in grid
            position_y: 10 + Math.floor(index / 5) * 60,
            rotation: 0
          };
        });
        
        setBoards([...boards, ...newBoards]);
        setJsonInput('');
        
        // Auto-select the new boards
        const newBoardIds = newBoards.map(b => b.id);
        setSelectedBoards([...selectedBoards, ...newBoardIds]);
        
        alert(`Successfully imported ${newBoards.length} components!`);
      } else {
        alert('Invalid JSON format. Please provide a JSON object with a "components" array.');
      }
    } catch (error) {
      alert('Error parsing JSON: ' + error.message);
    }
  };

  // Create new board
  const createBoard = () => {
    const newId = Math.max(...boards.map(b => b.id), 0) + 1;
    const board = {
      ...newBoard,
      id: newId,
      position_x: 10,
      position_y: 10,
      rotation: 0
    };
    
    setBoards([...boards, board]);
    setNewBoard({
      name: '',
      width: 50,
      height: 30,
      mounting_holes_x: 2,
      mounting_holes_y: 2,
      hole_spacing_x: 40,
      hole_spacing_y: 20,
      hole_diameter: 3,
      standoff_height: 3
    });
  };

  // Duplicate board
  const duplicateBoard = (boardId) => {
    const originalBoard = boards.find(board => board.id === boardId);
    if (!originalBoard) return;
    
    const newId = Math.max(...boards.map(b => b.id), 0) + 1;
    const duplicatedBoard = {
      ...originalBoard,
      id: newId,
      name: `${originalBoard.name} (Copy)`,
      position_x: originalBoard.position_x + 20, // Offset position slightly
      position_y: originalBoard.position_y + 20
    };
    
    setBoards([...boards, duplicatedBoard]);
    
    // Auto-select the duplicated board
    setSelectedBoards([...selectedBoards, newId]);
  };

  // Delete board
  const deleteBoard = (boardId) => {
    setBoards(boards.filter(board => board.id !== boardId));
    setSelectedBoards(selectedBoards.filter(id => id !== boardId));
  };

  // Rotate board around its center
  const rotateBoard = (boardId) => {
    setBoards(boards.map(board => {
      if (board.id === boardId) {
        const { width: oldWidth, height: oldHeight } = getActualDimensions(board);
        const newRotation = (board.rotation + 90) % 360;
        
        // Calculate new dimensions after rotation
        const newBoard = { ...board, rotation: newRotation };
        const { width: newWidth, height: newHeight } = getActualDimensions(newBoard);
        
        // Adjust position to keep the center in the same place
        const centerX = board.position_x + oldWidth / 2;
        const centerY = board.position_y + oldHeight / 2;
        
        return {
          ...newBoard,
          position_x: centerX - newWidth / 2,
          position_y: centerY - newHeight / 2
        };
      }
      return board;
    }));
  };

  // Handle image file selection
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    processImageFile(file);
  };

  // Process image file from various sources (file input or paste)
  const processImageFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImageError('');
    } else {
      setImageError('Please select a valid image file (PNG, JPG, etc.)');
      setImageFile(null);
    }
  };

  // Handle paste event for images from clipboard
  const handlePaste = (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        processImageFile(blob);
        break;
      }
    }
  };

  // Set up paste event listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Process image with Gemini API
  const processImageWithGemini = async () => {
    if (!imageFile || !imagePrompt.trim()) {
      setImageError('Please select an image and provide a description.');
      return;
    }

    setIsProcessingImage(true);
    setImageError('');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('prompt', imagePrompt);

      const response = await fetch('http://localhost:5004/api/extract-dimensions', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.dimensions) {
        // Populate the form with extracted dimensions
        setNewBoard({
          name: result.dimensions.name || 'Extracted Board',
          width: result.dimensions.width || 50,
          height: result.dimensions.height || 30,
          mounting_holes_x: result.dimensions.mounting_holes_x || 2,
          mounting_holes_y: result.dimensions.mounting_holes_y || 2,
          hole_spacing_x: result.dimensions.hole_spacing_x || 40,
          hole_spacing_y: result.dimensions.hole_spacing_y || 20,
          hole_diameter: result.dimensions.hole_diameter || 3,
          standoff_height: result.dimensions.standoff_height || 10
        });

        // Clear the image upload
        setImageFile(null);
        setImagePrompt('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        alert('Dimensions extracted successfully! Please review and adjust if needed.');
      } else {
        throw new Error(result.error || 'Failed to extract dimensions from image');
      }
    } catch (error) {
      console.error('Error processing image:', error);
      setImageError(`Error: ${error.message}`);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Handle mouse down on board for dragging
  const handleMouseDown = (e, board) => {
    e.preventDefault();
    e.stopPropagation();
    
    const svgRect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - svgRect.left) * (baseWidth + 20) / svgRect.width;
    const svgY = (e.clientY - svgRect.top) * (baseHeight + 20) / svgRect.height;
    
    setDraggedBoard(board.id);
    setDragOffset({
      x: svgX - (board.x + 10),
      y: svgY - (board.y + 10)
    });
  };

  // Handle mouse move for dragging
  const handleMouseMove = (e) => {
    if (!draggedBoard) return;
    
    const svgRect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - svgRect.left) * (baseWidth + 20) / svgRect.width;
    const svgY = (e.clientY - svgRect.top) * (baseHeight + 20) / svgRect.height;
    
    const draggedBoardData = boards.find(b => b.id === draggedBoard);
    if (!draggedBoardData) return;
    
    const { width, height } = getActualDimensions(draggedBoardData);
    
    const newX = Math.max(0, Math.min(baseWidth - width, svgX - dragOffset.x - 10));
    const newY = Math.max(0, Math.min(baseHeight - height, svgY - dragOffset.y - 10));
    
    setBoards(boards.map(board => 
      board.id === draggedBoard 
        ? { ...board, position_x: newX, position_y: newY }
        : board
    ));
  };

  // Handle mouse up to stop dragging
  const handleMouseUp = () => {
    setDraggedBoard(null);
    setDragOffset({ x: 0, y: 0 });
  };

  // Download DXF file with proper formatting
  const downloadDXF = () => {
    if (!previewData || previewData.boards.length === 0) {
      alert('No boards selected for export');
      return;
    }

    let dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
4
0
LAYER
2
BOARD_OUTLINE
70
0
62
1
6
CONTINUOUS
0
LAYER
2
MOUNTING_HOLES
70
0
62
2
6
CONTINUOUS
0
LAYER
2
BOARD_LABELS
70
0
62
3
6
CONTINUOUS
0
LAYER
2
BASE_OUTLINE
70
0
62
4
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

    // Add base plate outline
    dxfContent += `0
LWPOLYLINE
8
BASE_OUTLINE
62
4
90
5
70
1
10
0
20
0
10
${baseWidth}
20
0
10
${baseWidth}
20
${baseHeight}
10
0
20
${baseHeight}
10
0
20
0
`;

    // Add boards
    previewData.boards.forEach(board => {
      // Board outline
      dxfContent += `0
LWPOLYLINE
8
BOARD_OUTLINE
62
1
90
5
70
1
10
${board.x}
20
${board.y}
10
${board.x + board.width}
20
${board.y}
10
${board.x + board.width}
20
${board.y + board.height}
10
${board.x}
20
${board.y + board.height}
10
${board.x}
20
${board.y}
`;

      // Board label
      dxfContent += `0
TEXT
8
BOARD_LABELS
62
3
10
${board.x + board.width / 2}
20
${board.y + board.height / 2}
40
5
1
${board.name}
`;

      // Mounting holes
      board.holes.forEach(hole => {
        dxfContent += `0
CIRCLE
8
MOUNTING_HOLES
62
2
10
${hole.x}
20
${hole.y}
40
${hole.diameter / 2}
`;
      });
    });

    dxfContent += `0
ENDSEC
0
EOF`;
    
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rf_board_layout.dxf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Download STL file for standoff - proper cylindrical standoff
  const downloadSTL = (board) => {
    const height = board.standoff_height || 3;
    const innerRadius = board.hole_diameter / 2;
    const outerRadius = innerRadius * 1.5; // 1.5x bigger outer diameter
    
    // Generate cylindrical standoff with hollow center
    const segments = 16; // Number of segments for the cylinder
    const vertices = [];
    const facets = [];
    
    // Generate vertices for top and bottom circles
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const x_outer = Math.cos(angle) * outerRadius;
      const y_outer = Math.sin(angle) * outerRadius;
      const x_inner = Math.cos(angle) * innerRadius;
      const y_inner = Math.sin(angle) * innerRadius;
      
      // Bottom vertices (z = 0)
      vertices.push([x_outer, y_outer, 0]); // outer bottom
      vertices.push([x_inner, y_inner, 0]); // inner bottom
      
      // Top vertices (z = height)
      vertices.push([x_outer, y_outer, height]); // outer top
      vertices.push([x_inner, y_inner, height]); // inner top
    }
    
    let stlContent = `solid ${board.name}_standoff\n`;
    
    // Generate facets for the cylindrical standoff
    for (let i = 0; i < segments; i++) {
      const i1 = i * 4;
      const i2 = ((i + 1) % segments) * 4;
      
      // Outer wall - 2 triangles per segment
      stlContent += `facet normal 0 0 0
  outer loop
    vertex ${vertices[i1][0]} ${vertices[i1][1]} ${vertices[i1][2]}
    vertex ${vertices[i2][0]} ${vertices[i2][1]} ${vertices[i2][2]}
    vertex ${vertices[i1 + 2][0]} ${vertices[i1 + 2][1]} ${vertices[i1 + 2][2]}
  endloop
endfacet
facet normal 0 0 0
  outer loop
    vertex ${vertices[i2][0]} ${vertices[i2][1]} ${vertices[i2][2]}
    vertex ${vertices[i2 + 2][0]} ${vertices[i2 + 2][1]} ${vertices[i2 + 2][2]}
    vertex ${vertices[i1 + 2][0]} ${vertices[i1 + 2][1]} ${vertices[i1 + 2][2]}
  endloop
endfacet
`;
      
      // Inner wall - 2 triangles per segment (reversed winding)
      stlContent += `facet normal 0 0 0
  outer loop
    vertex ${vertices[i1 + 1][0]} ${vertices[i1 + 1][1]} ${vertices[i1 + 1][2]}
    vertex ${vertices[i1 + 3][0]} ${vertices[i1 + 3][1]} ${vertices[i1 + 3][2]}
    vertex ${vertices[i2 + 1][0]} ${vertices[i2 + 1][1]} ${vertices[i2 + 1][2]}
  endloop
endfacet
facet normal 0 0 0
  outer loop
    vertex ${vertices[i2 + 1][0]} ${vertices[i2 + 1][1]} ${vertices[i2 + 1][2]}
    vertex ${vertices[i1 + 3][0]} ${vertices[i1 + 3][1]} ${vertices[i1 + 3][2]}
    vertex ${vertices[i2 + 3][0]} ${vertices[i2 + 3][1]} ${vertices[i2 + 3][2]}
  endloop
endfacet
`;
      
      // Bottom ring - 2 triangles per segment
      stlContent += `facet normal 0 0 -1
  outer loop
    vertex ${vertices[i1][0]} ${vertices[i1][1]} ${vertices[i1][2]}
    vertex ${vertices[i1 + 1][0]} ${vertices[i1 + 1][1]} ${vertices[i1 + 1][2]}
    vertex ${vertices[i2][0]} ${vertices[i2][1]} ${vertices[i2][2]}
  endloop
endfacet
facet normal 0 0 -1
  outer loop
    vertex ${vertices[i2][0]} ${vertices[i2][1]} ${vertices[i2][2]}
    vertex ${vertices[i1 + 1][0]} ${vertices[i1 + 1][1]} ${vertices[i1 + 1][2]}
    vertex ${vertices[i2 + 1][0]} ${vertices[i2 + 1][1]} ${vertices[i2 + 1][2]}
  endloop
endfacet
`;
      
      // Top ring - 2 triangles per segment
      stlContent += `facet normal 0 0 1
  outer loop
    vertex ${vertices[i1 + 2][0]} ${vertices[i1 + 2][1]} ${vertices[i1 + 2][2]}
    vertex ${vertices[i2 + 2][0]} ${vertices[i2 + 2][1]} ${vertices[i2 + 2][2]}
    vertex ${vertices[i1 + 3][0]} ${vertices[i1 + 3][1]} ${vertices[i1 + 3][2]}
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex ${vertices[i2 + 2][0]} ${vertices[i2 + 2][1]} ${vertices[i2 + 2][2]}
    vertex ${vertices[i2 + 3][0]} ${vertices[i2 + 3][1]} ${vertices[i2 + 3][2]}
    vertex ${vertices[i1 + 3][0]} ${vertices[i1 + 3][1]} ${vertices[i1 + 3][2]}
  endloop
endfacet
`;
    }
    
    stlContent += `endsolid ${board.name}_standoff`;
    
    const blob = new Blob([stlContent], { type: 'application/sla' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.name}_standoff.stl`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Load sample JSON
  const loadSampleJSON = () => {
    const sampleJSON = `{
  "components": [
    {
      "id": "Power_Board",
      "width": 114.0,
      "height": 54.0,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 105.0,
      "mounting_hole_dy": 45.0,
      "mounting_hole_diameter": 4.0
    },
    {
      "id": "CTL200-0",
      "width": 100.0,
      "height": 57.7,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 90.0,
      "mounting_hole_dy": 40.0,
      "mounting_hole_diameter": 3.0
    },
    {
      "id": "IsoBragg",
      "width": 58.0,
      "height": 40.0,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 52.0,
      "mounting_hole_dy": 34.0,
      "mounting_hole_diameter": 3.2
    },
    {
      "id": "PI200",
      "width": 75.0,
      "height": 59.5,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 65.0,
      "mounting_hole_dy": 40.0,
      "mounting_hole_diameter": 3.0
    },
    {
      "id": "Bipolar_5V",
      "width": 42.0,
      "height": 24.0,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 40.0,
      "mounting_hole_dy": 22.0,
      "mounting_hole_diameter": 2.5
    },
    {
      "id": "ZFL-2000X+",
      "width": 55.6,
      "height": 31.8,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 42.9,
      "mounting_hole_dy": 19.1,
      "mounting_hole_diameter": 3.2
    },
    {
      "id": "ZX05-10-S+",
      "width": 23.0,
      "height": 18.8,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 1,
      "mounting_hole_dx": 12.6,
      "mounting_hole_dy": 0.0,
      "mounting_hole_diameter": 2.7
    },
    {
      "id": "ZFL-500-LN+",
      "width": 55.4,
      "height": 31.8,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 42.9,
      "mounting_hole_dy": 19.1,
      "mounting_hole_diameter": 3.2
    }
  ]
}`;
    setJsonInput(sampleJSON);
  };

  useEffect(() => {
    generatePreviewData();
  }, [selectedBoards, baseWidth, baseHeight, boards]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedBoard, dragOffset, boards, baseWidth, baseHeight]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">RF Board Organizer</h1>
        
        <Tabs defaultValue="boards" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="boards">Board Management</TabsTrigger>
            <TabsTrigger value="import">Import JSON</TabsTrigger>
            <TabsTrigger value="layout">Layout Design</TabsTrigger>
            <TabsTrigger value="export">Export Files</TabsTrigger>
          </TabsList>
          
          <TabsContent value="boards" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Add New Board Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Add New Board
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Image Upload Section */}
                  <Card className="bg-blue-50 border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Extract Dimensions from Image (AI-Powered)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-4">
                        <div className="grid w-full items-center gap-1.5">
                          <Label htmlFor="image-upload">Upload Board Image</Label>
                          <div 
                            ref={dropZoneRef}
                            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            onPaste={handlePaste}
                          >
                            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Drag & drop an image here, click to browse, or paste from clipboard
                            </p>
                            <Input 
                              id="image-upload" 
                              type="file" 
                              accept="image/*"
                              onChange={handleImageUpload}
                              ref={fileInputRef}
                              className="hidden"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="image-prompt">Description/Prompt</Label>
                        <Textarea
                          id="image-prompt"
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                          placeholder="Describe what to extract: 'Extract board dimensions, mounting hole spacing, and hole diameter from this technical drawing'"
                          className="mt-1 h-20"
                        />
                      </div>
                      
                      {imageError && (
                        <div className="flex items-center gap-2 text-red-600 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          {imageError}
                        </div>
                      )}
                      
                      <Button 
                        onClick={processImageWithGemini}
                        disabled={!imageFile || !imagePrompt.trim() || isProcessingImage}
                        className="w-full"
                      >
                        {isProcessingImage ? (
                          <>Processing Image...</>
                        ) : (
                          <>
                            <Camera className="h-4 w-4 mr-2" />
                            Extract Dimensions with AI
                          </>
                        )}
                      </Button>
                      
                      <div className="text-xs text-gray-600">
                        Upload a PNG/JPG of a dimensional drawing and AI will extract the board dimensions, mounting hole spacing, and hole diameter.
                      </div>
                    </CardContent>
                  </Card>

                  {/* Manual Input Form */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Board Name</Label>
                      <Input
                        id="name"
                        value={newBoard.name}
                        onChange={(e) => setNewBoard({...newBoard, name: e.target.value})}
                        placeholder="e.g., RF Amplifier"
                      />
                    </div>
                    <div>
                      <Label htmlFor="standoff_height">Standoff Height (mm)</Label>
                      <Input
                        id="standoff_height"
                        type="number"
                        value={newBoard.standoff_height}
                        onChange={(e) => setNewBoard({...newBoard, standoff_height: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="width">Width (mm)</Label>
                      <Input
                        id="width"
                        type="number"
                        value={newBoard.width}
                        onChange={(e) => setNewBoard({...newBoard, width: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="height">Height (mm)</Label>
                      <Input
                        id="height"
                        type="number"
                        value={newBoard.height}
                        onChange={(e) => setNewBoard({...newBoard, height: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="holes_x">Mounting Holes X</Label>
                      <Select value={newBoard.mounting_holes_x.toString()} onValueChange={(value) => setNewBoard({...newBoard, mounting_holes_x: parseInt(value)})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="holes_y">Mounting Holes Y</Label>
                      <Select value={newBoard.mounting_holes_y.toString()} onValueChange={(value) => setNewBoard({...newBoard, mounting_holes_y: parseInt(value)})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="hole_spacing_x">Hole Spacing X (mm)</Label>
                      <Input
                        id="hole_spacing_x"
                        type="number"
                        value={newBoard.hole_spacing_x}
                        onChange={(e) => setNewBoard({...newBoard, hole_spacing_x: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hole_spacing_y">Hole Spacing Y (mm)</Label>
                      <Input
                        id="hole_spacing_y"
                        type="number"
                        value={newBoard.hole_spacing_y}
                        onChange={(e) => setNewBoard({...newBoard, hole_spacing_y: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hole_diameter">Hole Diameter (mm)</Label>
                      <Input
                        id="hole_diameter"
                        type="number"
                        value={newBoard.hole_diameter}
                        onChange={(e) => setNewBoard({...newBoard, hole_diameter: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                  
                  <Button onClick={createBoard} className="w-full">
                    Add Board
                  </Button>
                </CardContent>
              </Card>
              
              {/* Board List */}
              <Card>
                <CardHeader>
                  <CardTitle>Existing Boards ({boards.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {boards.map((board) => (
                      <div key={board.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedBoards.includes(board.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBoards([...selectedBoards, board.id]);
                              } else {
                                setSelectedBoards(selectedBoards.filter(id => id !== board.id));
                              }
                            }}
                            className="rounded"
                          />
                          <div>
                            <div className="font-medium">{board.name}</div>
                            <div className="text-sm text-gray-500">
                              {board.width}×{board.height}mm, {board.mounting_holes_x}×{board.mounting_holes_y} holes
                            </div>
                            <div className="text-xs text-gray-400">
                              Position: ({board.position_x.toFixed(1)}, {board.position_y.toFixed(1)}) | Rotation: {board.rotation}°
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => duplicateBoard(board.id)}
                            title="Duplicate Board"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rotateBoard(board.id)}
                            title="Rotate 90°"
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadSTL(board)}
                            title="Download STL"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteBoard(board.id)}
                            title="Delete Board"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Import Components from JSON
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="json-input">JSON Component Data</Label>
                  <Textarea
                    id="json-input"
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder="Paste your JSON component data here..."
                    className="min-h-64 font-mono text-sm"
                  />
                </div>
                
                <div className="flex gap-4">
                  <Button onClick={importFromJSON} disabled={!jsonInput.trim()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Components
                  </Button>
                  <Button variant="outline" onClick={loadSampleJSON}>
                    <FileText className="h-4 w-4 mr-2" />
                    Load Sample Data
                  </Button>
                </div>
                
                <div className="text-sm text-gray-600 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-2">Expected JSON Format:</h4>
                  <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
{`{
  "components": [
    {
      "id": "Component_Name",
      "width": 50.0,
      "height": 30.0,
      "units": "mm",
      "mounting_holes_x": 2,
      "mounting_holes_y": 2,
      "mounting_hole_dx": 40.0,
      "mounting_hole_dy": 20.0,
      "mounting_hole_diameter": 3.0
    }
  ]
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="layout" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Layout Controls */}
              <Card>
                <CardHeader>
                  <CardTitle>Base Plate Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="base_width">Base Width (mm)</Label>
                    <Input
                      id="base_width"
                      type="number"
                      value={baseWidth}
                      onChange={(e) => setBaseWidth(parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="base_height">Base Height (mm)</Label>
                    <Input
                      id="base_height"
                      type="number"
                      value={baseHeight}
                      onChange={(e) => setBaseHeight(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    Selected boards: {selectedBoards.length}
                  </div>
                  <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Move className="h-4 w-4" />
                      <span className="font-medium">Interactive Controls:</span>
                    </div>
                    <ul className="space-y-1">
                      <li>• Drag boards to reposition</li>
                      <li>• Click rotate button for 90° turns</li>
                      <li>• Check/uncheck to include in layout</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
              
              {/* Preview */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Interactive Layout Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-4 bg-white">
                    <svg
                      ref={svgRef}
                      width="100%"
                      height="400"
                      viewBox={`0 0 ${baseWidth + 20} ${baseHeight + 20}`}
                      className="border cursor-pointer"
                      style={{ userSelect: 'none' }}
                    >
                      {/* Base plate outline */}
                      <rect
                        x="10"
                        y="10"
                        width={baseWidth}
                        height={baseHeight}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />
                      
                      {/* Grid lines */}
                      <defs>
                        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect x="10" y="10" width={baseWidth} height={baseHeight} fill="url(#grid)" />
                      
                      {/* Boards */}
                      {previewData?.boards.map((board) => (
                        <g key={board.id}>
                          {/* Board outline */}
                          <rect
                            x={10 + board.x}
                            y={10 + board.y}
                            width={board.width}
                            height={board.height}
                            fill={draggedBoard === board.id ? "#bfdbfe" : "#dbeafe"}
                            stroke="#3b82f6"
                            strokeWidth="2"
                            className="cursor-move"
                            onMouseDown={(e) => handleMouseDown(e, board)}
                          />
                          
                          {/* Board label */}
                          <text
                            x={10 + board.x + board.width / 2}
                            y={10 + board.y + board.height / 2 - 5}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="10"
                            fill="#1e40af"
                            className="pointer-events-none"
                          >
                            {board.name}
                          </text>
                          
                          {/* Rotation indicator */}
                          <text
                            x={10 + board.x + board.width / 2}
                            y={10 + board.y + board.height / 2 + 5}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="8"
                            fill="#6b7280"
                            className="pointer-events-none"
                          >
                            {board.rotation}°
                          </text>
                          
                          {/* Mounting holes */}
                          {board.holes.map((hole, index) => (
                            <circle
                              key={index}
                              cx={10 + hole.x}
                              cy={10 + hole.y}
                              r={hole.diameter / 2}
                              fill="#ef4444"
                              stroke="#dc2626"
                              strokeWidth="0.5"
                              className="pointer-events-none"
                            />
                          ))}
                          
                          {/* Rotate button */}
                          <g
                            className="cursor-pointer"
                            onClick={() => rotateBoard(board.id)}
                          >
                            <circle
                              cx={10 + board.x + board.width - 8}
                              cy={10 + board.y + 8}
                              r="6"
                              fill="#10b981"
                              stroke="#059669"
                              strokeWidth="1"
                            />
                            <text
                              x={10 + board.x + board.width - 8}
                              y={10 + board.y + 8}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize="8"
                              fill="white"
                              className="pointer-events-none"
                            >
                              ↻
                            </text>
                          </g>
                          
                          {/* Drag handle */}
                          <circle
                            cx={10 + board.x + board.width - 8}
                            cy={10 + board.y + board.height - 8}
                            r="4"
                            fill="#6b7280"
                            className="cursor-move"
                            onMouseDown={(e) => handleMouseDown(e, board)}
                          />
                        </g>
                      ))}
                      
                      {/* Dimensions */}
                      <text x={10 + baseWidth / 2} y={baseHeight + 25} textAnchor="middle" fontSize="12" fill="#6b7280">
                        {baseWidth}mm
                      </text>
                      <text x="5" y={10 + baseHeight / 2} textAnchor="middle" fontSize="12" fill="#6b7280" transform={`rotate(-90, 5, ${10 + baseHeight / 2})`}>
                        {baseHeight}mm
                      </text>
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Export Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600 mb-4">
                  Selected boards: {selectedBoards.length}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={downloadDXF}
                    disabled={selectedBoards.length === 0}
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <Download className="h-6 w-6" />
                    <span>Download DXF</span>
                    <span className="text-xs opacity-75">For laser cutting</span>
                  </Button>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">STL Files (Standoffs)</div>
                    <div className="text-xs text-gray-600 mb-2">
                      Download individual STL files for each board's standoffs
                    </div>
                    {boards.filter(board => selectedBoards.includes(board.id)).map((board) => (
                      <Button
                        key={board.id}
                        variant="outline"
                        size="sm"
                        onClick={() => downloadSTL(board)}
                        className="w-full justify-start"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {board.name} Standoff
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="text-xs text-gray-500 p-3 bg-green-50 rounded-lg">
                  <strong>File Generation:</strong> This application generates actual DXF files for laser cutting 
                  and STL files for 3D printing. DXF files include separate layers for board outlines (blue), 
                  mounting holes (red), labels (green), and base outline (magenta). STL files are proper cylindrical 
                  standoffs with hollow centers.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;

