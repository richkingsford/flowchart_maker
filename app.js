document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const workflowSelect = document.getElementById('workflowSelect');
    const colorSchemaSelect = document.getElementById('colorSchemaSelect');
    const colorSchemaPreview = document.getElementById('colorSchemaPreview');
    const horizontalSpacingInput = document.getElementById('horizontalSpacing');
    const verticalSpacingInput = document.getElementById('verticalSpacing');
    const fontSizeInput = document.getElementById('fontSizeInput');
    const downloadSvgButton = document.getElementById('downloadSvgButton');
    const workflowDiagramSvg = document.getElementById('workflowDiagram');

    // --- Available Workflows (Hardcoded for now) ---
    // In a real app with a backend, this list would likely be fetched.
    const availableWorkflows = [
        { name: "QA Process", path: "workflows/qa_process.json" },
        // Add other workflow files here if they exist, e.g.:
        // { name: "Sample Workflow 2", path: "workflows/sample2.json" }
    ];

    // --- Color Schemas ---
    const colorSchemas = {
        default: {
            name: "Default",
            action: { fill: '#5DADE2', stroke: '#2E86C1', text: '#FFFFFF' }, // Brighter Blue, White Text
            decision: { fill: '#FFDAB9', stroke: '#E0B990', text: '#000000' }, // Peach
            terminal: { fill: '#C1E1C1', stroke: '#97B897', text: '#000000' }, // Pastel Green
            line: '#555555',
            lineLabel: '#000000',
            background: '#FFFFFF'
        },
        monochrome: {
            name: "Monochrome",
            action: { fill: '#E0E0E0', stroke: '#757575', text: '#000000' }, // Light Grey
            decision: { fill: '#BDBDBD', stroke: '#616161', text: '#000000' }, // Grey
            terminal: { fill: '#F5F5F5', stroke: '#9E9E9E', text: '#000000' }, // Lighter Grey
            line: '#424242',
            lineLabel: '#000000',
            background: '#FFFFFF'
        },
        highContrastDark: {
            name: "High Contrast Dark",
            action: { fill: '#2C3E50', stroke: '#ECF0F1', text: '#FFFFFF' }, // Dark Slate
            decision: { fill: '#9B59B6', stroke: '#ECF0F1', text: '#FFFFFF' }, // Purple
            terminal: { fill: '#16A085', stroke: '#ECF0F1', text: '#FFFFFF' }, // Green Sea
            line: '#ECF0F1',
            lineLabel: '#FFFFFF',
            background: '#1A242F'
        },
        pastel: {
            name: "Pastel Dreams",
            action: { fill: '#FFDAC1', stroke: '#E0B990', text: '#5D4037' }, // Light Peach
            decision: { fill: '#E0BBE4', stroke: '#C39DC1', text: '#5D4037' }, // Light Lavender
            terminal: { fill: '#B3E2CD', stroke: '#8FBEA7', text: '#5D4037' }, // Light Mint
            line: '#A38A7A',
            lineLabel: '#5D4037',
            background: '#FAF3E0'
        }
    };

    let currentWorkflowData = null;
    let currentSettings = {
        colors: colorSchemas.default,
        hSpacing: parseInt(horizontalSpacingInput.value),
        vSpacing: parseInt(verticalSpacingInput.value),
        fontSize: parseInt(fontSizeInput.value) || 12
    };

    // --- Functions ---

    function populateWorkflowSelect() {
        availableWorkflows.forEach(wf => {
            const option = document.createElement('option');
            option.value = wf.path;
            option.textContent = wf.name;
            workflowSelect.appendChild(option);
        });
    }

    function populateColorSchemaDropdown() {
        for (const key in colorSchemas) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = colorSchemas[key].name;
            colorSchemaSelect.appendChild(option);
        }
    }

    function updateColorSchemaPreview() {
        const selectedSchemaKey = colorSchemaSelect.value;
        const schema = colorSchemas[selectedSchemaKey];
        currentSettings.colors = schema;
        workflowDiagramSvg.style.backgroundColor = schema.background;


        colorSchemaPreview.innerHTML = ''; // Clear previous preview

        const colorsToPreview = [
            schema.action.fill,
            schema.decision.fill,
            schema.terminal.fill,
            schema.line
        ];

        colorsToPreview.forEach(color => {
            const circle = document.createElement('div');
            circle.classList.add('color-preview-circle');
            circle.style.backgroundColor = color;
            if (isColorDark(color)) { // Add border for dark colors for better visibility against dark preview bg if any
                 circle.style.borderColor = '#FFFFFF';
            } else {
                 circle.style.borderColor = '#777777';
            }
            colorSchemaPreview.appendChild(circle);
        });

        // Re-render if data exists
        if (currentWorkflowData) {
            renderWorkflow(currentWorkflowData, currentSettings);
        }
    }

    function isColorDark(hexColor) {
        const color = (hexColor.charAt(0) === '#') ? hexColor.substring(1, 7) : hexColor;
        const r = parseInt(color.substring(0, 2), 16); // Red
        const g = parseInt(color.substring(2, 4), 16); // Green
        const b = parseInt(color.substring(4, 6), 16); // Blue
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
    }


    // --- SVG Namespace ---
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const nodePadding = { x: 20, y: 10 };
    const defaultNodeSize = { width: 160, height: 70 }; // Adjusted min size for better text fit

    // This will hold the processed workflow data, including positions and SVG elements
    let activeNodeMap = new Map();
    let draggedNode = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    let isDrawingLine = false;
    let lineFromNode = null;
    // let lineFromPort = null; // Could specify which port ('top', 'bottom', etc.)
    let tempLineElement = null;


    // --- Workflow Loading & Main Rendering Orchestration ---
    async function loadWorkflow(workflowFileName) {
        try {
            const response = await fetch(workflowFileName);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const workflowKey = Object.keys(data)[0];
            currentWorkflowData = data[workflowKey]; // Keep original for re-layout if needed

            activeNodeMap = prepareWorkflowData(currentWorkflowData);
            const layoutDimensions = calculateStaticLayout(activeNodeMap, currentSettings);
            drawDiagram(activeNodeMap, currentSettings, layoutDimensions);

            console.log("Workflow data processed and rendered:", activeNodeMap);

        } catch (error) {
            console.error("Error loading workflow:", error);
            workflowDiagramSvg.innerHTML = `<text x="20" y="40" fill="red">Error loading: ${error.message}</text>`;
        }
    }

    // This function is called when settings change that require a full re-layout and redraw
    function rerenderCurrentWorkflow() {
        if (!currentWorkflowData) return;
        activeNodeMap = prepareWorkflowData(currentWorkflowData); // Re-prep to reset any drag positions to original logic
        const layoutDimensions = calculateStaticLayout(activeNodeMap, currentSettings);
        drawDiagram(activeNodeMap, currentSettings, layoutDimensions);
    }


    // --- Data Preparation and Layout Calculation ---
    function prepareWorkflowData(workflowSteps) {
        const nodeMap = new Map();
        if (!workflowSteps || workflowSteps.length === 0) return nodeMap;

        workflowSteps.forEach(step => {
            const { width, height } = calculateNodeDimensions(step.name);
            nodeMap.set(step.id || step.stepID, { // Use step.id if present, fallback to step.stepID
                ...step,
                id: step.id || step.stepID,
                x: 0, y: 0, width, height,
                centerX: 0, centerY: 0, levelX: 0, levelY: 0,
                children: [], parents: [],
                svgNode: null, svgLines: {}, svgLineLabels: {}
            });
        });

        nodeMap.forEach(node => {
            const nextStepInfos = [];
            if (node.type === 'decision' && node.options) {
                node.options.forEach(opt => nextStepInfos.push({ id: opt.nextStepID, text: opt.decisionText }));
            } else if (node.nextStepID) {
                nextStepInfos.push({ id: node.nextStepID });
            }

            nextStepInfos.forEach(nextInfo => {
                if (nodeMap.has(nextInfo.id)) {
                    node.children.push(nextInfo);
                    nodeMap.get(nextInfo.id).parents.push(node.id);
                }
            });
        });
        return nodeMap;
    }

    function calculateNodeDimensions(stepName) {
        const fontSize = currentSettings.fontSize || 12; // Use current font size or default
        const lineHeightFactor = 1.2;
        const avgCharWidth = fontSize * 0.6; // Rough estimate, depends on font
        const targetNodeWidth = defaultNodeSize.width; // Use fixed width for now

        const maxCharsPerLine = Math.floor((targetNodeWidth - 2 * nodePadding.x) / avgCharWidth);
        const words = String(stepName).split(/[\s-]+/);

        let lines = 0;
        let currentLine = "";

        if (words.length === 0 || (words.length === 1 && words[0] === "")) {
            lines = 1; // Ensure at least one line for empty or whitespace-only names
        } else {
            words.forEach(word => {
                if (currentLine.length === 0) {
                    currentLine = word;
                    if (lines === 0) lines = 1; // Start counting lines with the first word
                } else if ((currentLine + " " + word).length > maxCharsPerLine) {
                    lines++;
                    currentLine = word;
                } else {
                    currentLine += " " + word;
                }
            });
             if (lines === 0 && currentLine.length > 0) lines = 1; // Case where all words fit on one line but loop didn't increment
        }
        if (lines === 0) lines = 1; // Final fallback for truly empty strings after processing

        const textBlockHeight = lines * fontSize * lineHeightFactor;
        const calculatedHeight = Math.max(defaultNodeSize.height, textBlockHeight + 2 * nodePadding.y);

        return { width: targetNodeWidth, height: calculatedHeight };
    }

    function calculateStaticLayout(nodeMap, settings) {
        if (nodeMap.size === 0) return { maxX: 0, maxY: 0 };
        const positionedNodes = new Set();
        let currentGlobalMaxX = 0;
        let currentGlobalMaxY = 0;

        function positionRecursive(nodeId, currentX, currentY, levelX = 0, levelY = 0) {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            if (positionedNodes.has(nodeId)) {
                if (levelY > node.levelY) node.levelY = levelY;
                if (levelX > node.levelX) node.levelX = levelX;
                return;
            }

            node.x = currentX;
            node.y = currentY;
            node.centerX = currentX + node.width / 2;
            node.centerY = currentY + node.height / 2;
            node.levelX = levelX;
            node.levelY = levelY;
            positionedNodes.add(nodeId);

            currentGlobalMaxX = Math.max(currentGlobalMaxX, node.x + node.width);
            currentGlobalMaxY = Math.max(currentGlobalMaxY, node.y + node.height);

            const children = node.children;
            if (node.type === 'decision' && children.length > 0) {
                const optionYes = children.find(opt => opt.text && opt.text.toLowerCase() === 'yes');
                const optionNo = children.find(opt => opt.text && opt.text.toLowerCase() === 'no');

                if (optionYes && nodeMap.has(optionYes.id)) {
                    positionRecursive(optionYes.id, node.x + node.width + settings.hSpacing, node.y, levelX + 1, levelY);
                }
                if (optionNo && nodeMap.has(optionNo.id)) {
                    let maxYAtCurrentX = node.y + node.height;
                    nodeMap.forEach(n => {
                        if(n.id !== nodeId && n.x === node.x && (n.y + n.height) > maxYAtCurrentX && positionedNodes.has(n.id)) {
                             maxYAtCurrentX = n.y + n.height;
                        }
                    });
                    positionRecursive(optionNo.id, node.x, maxYAtCurrentX + settings.vSpacing, levelX, levelY + 1);
                }
                // Simplified: other options are not specially positioned beyond the Yes/No paths for now in static layout
            } else if (children.length > 0) {
                const nextChildInfo = children[0];
                if (nodeMap.has(nextChildInfo.id)) {
                    let nextNodeX = node.x + node.width / 4 + settings.hSpacing / 2; // Default diagonal
                    let nextNodeY = node.y + node.height + settings.vSpacing;
                    positionRecursive(nextChildInfo.id, nextNodeX, nextNodeY, levelX + 1, levelY + 1);
                }
            }
        }

        const startNodes = Array.from(nodeMap.values()).filter(n => n.parents.length === 0 || n.parents.every(pID => !nodeMap.has(pID)));
        if (startNodes.length === 0 && nodeMap.size > 0) {
            startNodes.push(nodeMap.get(Array.from(nodeMap.keys())[0]));
        }
        startNodes.forEach((startNode, index) => {
            positionRecursive(startNode.id, 50 + index * (defaultNodeSize.width + settings.hSpacing), 50, index, 0);
        });

        return { maxX: currentGlobalMaxX, maxY: currentGlobalMaxY };
    }

    // --- SVG Drawing Engine ---
    function drawDiagram(nodeMap, settings, layoutDimensions) {
        workflowDiagramSvg.innerHTML = '';
        workflowDiagramSvg.style.backgroundColor = settings.colors.background;

        if (nodeMap.size === 0) {
            const textElement = document.createElementNS(SVG_NS, 'text');
            textElement.setAttribute('x', '20'); textElement.setAttribute('y', '40');
            textElement.setAttribute('fill', settings.colors.action ? settings.colors.action.text : 'black');
            textElement.textContent = "No workflow steps.";
            workflowDiagramSvg.appendChild(textElement);
            return;
        }

        nodeMap.forEach(node => drawNode(node, settings));
        nodeMap.forEach(node => drawLinesForNode(node, nodeMap, settings));

        addArrowheadMarker(settings);

        const padding = 50;
        const finalWidth = layoutDimensions.maxX > 0 ? layoutDimensions.maxX + padding : 800;
        const finalHeight = layoutDimensions.maxY > 0 ? layoutDimensions.maxY + padding : 600;
        workflowDiagramSvg.setAttribute('width', String(finalWidth));
        workflowDiagramSvg.setAttribute('height', String(finalHeight));
        workflowDiagramSvg.setAttribute('viewBox', `0 0 ${finalWidth} ${finalHeight}`);
    }

    function drawNode(node, settings) {
        const nodeColors = settings.colors[node.type] || settings.colors.action;
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('id', `node-${node.id}`);
        group.setAttribute('class', `node-group ${node.type}-node`);
        group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        group.style.cursor = 'grab'; // For draggable items

        let shape;
        if (node.type === 'decision') {
            shape = document.createElementNS(SVG_NS, 'polygon');
            shape.setAttribute('points', `${node.width/2},0 ${node.width},${node.height/2} ${node.width/2},${node.height} 0,${node.height/2}`);
        } else if (node.type === 'terminal') {
            shape = document.createElementNS(SVG_NS, 'ellipse');
            shape.setAttribute('cx', String(node.width / 2)); shape.setAttribute('cy', String(node.height / 2));
            shape.setAttribute('rx', String(node.width / 2)); shape.setAttribute('ry', String(node.height / 2));
        } else {
            shape = document.createElementNS(SVG_NS, 'rect');
            shape.setAttribute('width', String(node.width)); shape.setAttribute('height', String(node.height));
            shape.setAttribute('rx', '5'); shape.setAttribute('ry', '5');
        }
        shape.setAttribute('class', 'node-shape');
        shape.setAttribute('fill', nodeColors.fill); shape.setAttribute('stroke', nodeColors.stroke);
        group.appendChild(shape);

        const textElement = createSvgText(node.name, node.width / 2, node.height / 2, node.width - nodePadding.x * 1.5, nodeColors.text);
        group.appendChild(textElement);
        workflowDiagramSvg.appendChild(group);
        node.svgNode = group;
        makeDraggable(node);
        addConnectionHandles(node, settings); // Add connection points
    }

    function drawLinesForNode(startNode, nodeMap, settings) {
        if (!startNode.svgLines) startNode.svgLines = {};
        if (!startNode.svgLineLabels) startNode.svgLineLabels = {};

        startNode.children.forEach(childInfo => {
            const endNode = nodeMap.get(childInfo.id);
            if (!endNode) return;

            const lineId = `line-${startNode.id}-to-${childInfo.id}`;
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('id', lineId);

            const {x1, y1, x2, y2} = getLineCoordinates(startNode, endNode, childInfo.text);

            line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
            line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
            line.setAttribute('stroke', settings.colors.line);
            line.setAttribute('class', 'line-connector');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            workflowDiagramSvg.insertBefore(line, workflowDiagramSvg.firstChild);
            startNode.svgLines[childInfo.id] = line;

            if (childInfo.text) {
                const labelId = `label-${startNode.id}-to-${childInfo.id}`;
                const textLabel = document.createElementNS(SVG_NS, 'text');
                textLabel.setAttribute('id', labelId);
                // Position label near the middle of the line, slightly offset
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const offsetX = (x1 > x2 || y1 > y2 && !(x1 < x2 && y1 <y2)) ? -15 : 15; // Basic offset logic
                const offsetY = -15;

                textLabel.setAttribute('x', String(midX + offsetX));
                textLabel.setAttribute('y', String(midY + offsetY));
                textLabel.setAttribute('fill', settings.colors.lineLabel);
                textLabel.setAttribute('class', 'line-label');
                textLabel.textContent = childInfo.text;
                workflowDiagramSvg.insertBefore(textLabel, line);
                startNode.svgLineLabels[childInfo.id] = textLabel;
            }
        });
    }

    function getLineCoordinates(startNode, endNode, decisionText = null) {
        let x1 = startNode.x + startNode.width / 2;
        let y1 = startNode.y + startNode.height / 2;
        let x2 = endNode.x + endNode.width / 2;
        let y2 = endNode.y + endNode.height / 2;

        if (startNode.type === 'decision') {
            if (decisionText && decisionText.toLowerCase() === 'yes') {
                x1 = startNode.x + startNode.width;
            } else {
                y1 = startNode.y + startNode.height;
            }
        } else {
            y1 = startNode.y + startNode.height;
        }
        y2 = endNode.y; // Default entry point is top-center

        // Adjust if nodes are side-by-side for better connection points
        const yDiff = Math.abs((startNode.y + startNode.height/2) - (endNode.y + endNode.height/2));
        if (yDiff < Math.max(startNode.height, endNode.height) / 1.5) { // If nodes are roughly aligned horizontally
            if (endNode.x > startNode.x + startNode.width * 0.9) { // End node is to the right
                x1 = startNode.x + startNode.width;
                y1 = startNode.y + startNode.height / 2;
                x2 = endNode.x;
                y2 = endNode.y + endNode.height / 2;
            } else if (endNode.x + endNode.width < startNode.x * 0.9) { // End node is to the left
                x1 = startNode.x;
                y1 = startNode.y + startNode.height / 2;
                x2 = endNode.x + endNode.width;
                y2 = endNode.y + endNode.height / 2;
            }
        }
        return {x1, y1, x2, y2};
    }

    function addArrowheadMarker(settings) {
        let defs = workflowDiagramSvg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            workflowDiagramSvg.insertBefore(defs, workflowDiagramSvg.firstChild);
        }

        const oldMarker = defs.querySelector('#arrowhead');
        if (oldMarker) {
            defs.removeChild(oldMarker);
        }

        const marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10'); // Size of the viewport for the marker
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '8'); // Arrow tip at 8 (of 10) to give some space from node
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto-start-reverse'); // Orients correctly
        const polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7'); // Shape of the arrow
        // Arrowhead color will be set by the line's stroke color via 'context-stroke' or by inheriting if not specified
        // For explicit color: polygon.setAttribute('fill', settings.colors.line);
        // To make it inherit, we ensure no fill is set here, or use a special value.
        // However, direct 'fill' is more reliable across SVG viewers.
        polygon.setAttribute('fill', settings.colors.line);
        marker.appendChild(polygon);
        defs.appendChild(marker);
    }

    // --- Connection Handle Logic ---
    function addConnectionHandles(node, settings) {
        if (!node.svgNode) return;
        const handleRadius = 5;
        const nodeColors = settings.colors[node.type] || settings.colors.action;

        // Define handle positions (relative to the node's group)
        const handlePositions = [
            { x: node.width / 2, y: 0, id: 'top' },    // Top-middle
            { x: node.width / 2, y: node.height, id: 'bottom' }, // Bottom-middle
            { x: 0, y: node.height / 2, id: 'left' },  // Left-middle
            { x: node.width, y: node.height / 2, id: 'right' } // Right-middle
        ];

        handlePositions.forEach(pos => {
            const handle = document.createElementNS(SVG_NS, 'circle');
            handle.setAttribute('cx', String(pos.x));
            handle.setAttribute('cy', String(pos.y));
            handle.setAttribute('r', String(handleRadius));
            handle.setAttribute('fill', nodeColors.stroke); // Use node's stroke color for handle
            handle.setAttribute('stroke', nodeColors.fill); // Contrasting border
            handle.setAttribute('stroke-width', '1');
            handle.setAttribute('class', 'connection-handle');
            handle.style.cursor = 'crosshair';

            node.svgNode.appendChild(handle);

            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent node drag from starting
                e.preventDefault();
                if (e.button !== 0) return;

                isDrawingLine = true;
                lineFromNode = node;
                // lineFromPort = pos.id; // Store which port was clicked

                const CTM = workflowDiagramSvg.getScreenCTM().inverse();
                const startPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(CTM);

                tempLineElement = document.createElementNS(SVG_NS, 'line');
                tempLineElement.setAttribute('x1', String(node.x + pos.x));
                tempLineElement.setAttribute('y1', String(node.y + pos.y));
                tempLineElement.setAttribute('x2', String(startPoint.x));
                tempLineElement.setAttribute('y2', String(startPoint.y));
                tempLineElement.setAttribute('stroke', settings.colors.line || 'black');
                tempLineElement.setAttribute('stroke-width', '2');
                tempLineElement.setAttribute('stroke-dasharray', '5,5'); // Dashed line for temp
                workflowDiagramSvg.appendChild(tempLineElement);

                document.addEventListener('mousemove', onDrawingLine);
                document.addEventListener('mouseup', onEndLineDrawing);
            });
        });
    }

    function onDrawingLine(e) {
        if (!isDrawingLine || !tempLineElement) return;
        e.preventDefault();

        const CTM = workflowDiagramSvg.getScreenCTM().inverse();
        const currentPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(CTM);

        tempLineElement.setAttribute('x2', String(currentPoint.x));
        tempLineElement.setAttribute('y2', String(currentPoint.y));
    }

    function onEndLineDrawing(e) {
        if (!isDrawingLine) return;
        e.preventDefault();

        let lineToNode = null;
        // Basic hit detection: check if mouse up is over any node's main shape
        // More precise would be checking against other connection handles.
        const CTM = workflowDiagramSvg.getScreenCTM().inverse();
        const endPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(CTM);

        activeNodeMap.forEach(node => {
            if (node !== lineFromNode) { // Can't connect to self
                // Check if endPoint is within node bounds (simple rect check)
                if (endPoint.x >= node.x && endPoint.x <= node.x + node.width &&
                    endPoint.y >= node.y && endPoint.y <= node.y + node.height) {
                    lineToNode = node;
                }
            }
        });

        if (lineFromNode && lineToNode) {
            console.log(`Attempting to connect ${lineFromNode.id} to ${lineToNode.id}`);
            // --- Update Data Model ---
            // This is highly simplified. Only handles simple 'nextStepID' for non-decision nodes.
            // Does not handle removing old connections or decision node options.
            if (lineFromNode.type !== 'decision' && lineFromNode.nextStepID !== undefined) {
                // Remove old connection from children list if it exists
                const oldChildIndex = lineFromNode.children.findIndex(child => child.id === lineFromNode.nextStepID);
                if (oldChildIndex > -1) lineFromNode.children.splice(oldChildIndex,1);

                const oldNextNode = activeNodeMap.get(lineFromNode.nextStepID);
                if(oldNextNode){
                    const parentIndex = oldNextNode.parents.indexOf(lineFromNode.id);
                    if(parentIndex > -1) oldNextNode.parents.splice(parentIndex, 1);
                }


                lineFromNode.nextStepID = lineToNode.id;

                // Update children/parents for the new connection
                if (!lineFromNode.children.find(child => child.id === lineToNode.id)) {
                     lineFromNode.children.push({id: lineToNode.id}); // Add new child
                }
                if (!lineToNode.parents.includes(lineFromNode.id)) {
                    lineToNode.parents.push(lineFromNode.id); // Add new parent
                }

                // For a full solution, we'd need to update decision options, clear old connections etc.
                // For now, just trigger a full re-render to show the new connection.
                // This will recalculate layout which might not be desired if nodes were manually moved.
                // A more targeted update of just lines would be better.
                rerenderCurrentWorkflow(); // This re-calculates layout and redraws everything
            } else {
                console.warn("Connection logic only supports action->nextStepID for now or source node is a decision.");
            }
        } else {
            console.log("Line drawing cancelled or no valid target.");
        }

        if (tempLineElement) {
            tempLineElement.remove();
            tempLineElement = null;
        }
        isDrawingLine = false;
        lineFromNode = null;
        document.removeEventListener('mousemove', onDrawingLine);
        document.removeEventListener('mouseup', onEndLineDrawing);
    }


    // --- Drag and Drop Logic ---
    function makeDraggable(node) {
        if (!node || !node.svgNode) return;
        const svgNodeElement = node.svgNode;

        svgNodeElement.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button !== 0) return; // Only main mouse button

            draggedNode = node;
            draggedNode.svgNode.style.cursor = 'grabbing';

            // Calculate offset from the node's top-left to the mouse click point
            // We need the mouse position relative to the SVG container
            const CTM = workflowDiagramSvg.getScreenCTM();
            const svgMouseX = (e.clientX - CTM.e) / CTM.a;
            const svgMouseY = (e.clientY - CTM.f) / CTM.d;

            dragOffsetX = svgMouseX - draggedNode.x;
            dragOffsetY = svgMouseY - draggedNode.y;

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
        });
    }

    function onDrag(e) {
        if (!draggedNode) return;
        e.preventDefault();

        const CTM = workflowDiagramSvg.getScreenCTM();
        const newSvgMouseX = (e.clientX - CTM.e) / CTM.a;
        const newSvgMouseY = (e.clientY - CTM.f) / CTM.d;

        draggedNode.x = newSvgMouseX - dragOffsetX;
        draggedNode.y = newSvgMouseY - dragOffsetY;

        // Update visual position of the node
        draggedNode.svgNode.setAttribute('transform', `translate(${draggedNode.x}, ${draggedNode.y})`);

        updateConnectedLines(draggedNode);
    }

    function onDragEnd(e) {
        if (!draggedNode) return;
        e.preventDefault();

        draggedNode.svgNode.style.cursor = 'grab';
        draggedNode = null;

        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);

        // Optional: Snap to grid or other cleanup can be done here.
        // The activeNodeMap already has the updated x, y for the dragged node.
    }

    function updateConnectedLines(node) {
        // Update outgoing lines
        node.children.forEach(childInfo => {
            const childNode = activeNodeMap.get(childInfo.id);
            if (childNode) {
                const lineElem = node.svgLines[childInfo.id]; // Get from stored ref
                const labelElem = node.svgLineLabels ? node.svgLineLabels[childInfo.id] : null; // Get label ref
                if (lineElem) {
                    const {x1, y1, x2, y2} = getLineCoordinates(node, childNode, childInfo.text);
                    lineElem.setAttribute('x1', String(x1));
                    lineElem.setAttribute('y1', String(y1));
                    lineElem.setAttribute('x2', String(x2));
                    lineElem.setAttribute('y2', String(y2));

                    if (labelElem && childInfo.text) {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const offsetX = (x1 > x2 || y1 > y2 && !(x1 < x2 && y1 <y2)) ? -15 : 15;
                        const offsetY = -15;
                        labelElem.setAttribute('x', String(midX + offsetX));
                        labelElem.setAttribute('y', String(midY + offsetY));
                    }
                }
            }
        });

        // Update incoming lines
        node.parents.forEach(parentId => {
            const parentNode = activeNodeMap.get(parentId);
            if (parentNode) {
                 // Find which childInfo in parentNode.children corresponds to the current node
                const parentChildInfo = parentNode.children.find(c => c.id === node.id);
                if (parentChildInfo) {
                    const lineElem = parentNode.svgLines[node.id]; // Get from stored ref on parent
                    const labelElem = parentNode.svgLineLabels ? parentNode.svgLineLabels[node.id] : null;
                    if (lineElem) {
                        const {x1, y1, x2, y2} = getLineCoordinates(parentNode, node, parentChildInfo.text);
                        lineElem.setAttribute('x1', String(x1));
                        lineElem.setAttribute('y1', String(y1));
                        lineElem.setAttribute('x2', String(x2));
                        lineElem.setAttribute('y2', String(y2));

                         if (labelElem && parentChildInfo.text) {
                            const midX = (x1 + x2) / 2;
                            const midY = (y1 + y2) / 2;
                            const offsetX = (x1 > x2 || y1 > y2 && !(x1 < x2 && y1 <y2)) ? -15 : 15;
                            const offsetY = -15;
                            labelElem.setAttribute('x', String(midX + offsetX));
                            labelElem.setAttribute('y', String(midY + offsetY));
                        }
                    }
                }
            }
        });
    }

    function createSvgText(text, x, y, maxWidth, textColor) {
        const textElement = document.createElementNS(SVG_NS, 'text');
        textElement.setAttribute('x', String(x)); // Ensure x is string for setAttribute
        textElement.setAttribute('class', 'node-text');
        textElement.setAttribute('fill', textColor);
        textElement.style.textAnchor = 'middle'; // Ensure it's middle anchored via style too
        // dominant-baseline is set in CSS, but can be set here too if needed:
        // textElement.style.dominantBaseline = 'middle';


        const words = text.split(/[\s-]+/); // Split by space or hyphen for better wrapping
        let tspanElement = document.createElementNS(SVG_NS, 'tspan');
        textElement.appendChild(tspanElement);
        let lineCount = 0;
        let currentLine = "";

        function addNewLine() {
            tspanElement = document.createElementNS(SVG_NS, 'tspan');
            tspanElement.setAttribute('x', String(x));
            tspanElement.setAttribute('dy', lineCount === 0 ? '0' : '1.2em'); // No dy for first line from text y, then 1.2em for subsequent
            textElement.appendChild(tspanElement);
            lineCount++;
            return tspanElement;
        }

        tspanElement = addNewLine(); // Start the first line

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const separator = currentLine.length === 0 ? "" : " ";
            const testLine = currentLine + separator + word;
            tspanElement.textContent = testLine;

            if (tspanElement.getComputedTextLength() > maxWidth && currentLine.length > 0) {
                // Word makes the line too long, and it's not the first word on this line
                tspanElement.textContent = currentLine; // Set previous line content

                currentLine = word; // Start new line with current word
                tspanElement = addNewLine();
                tspanElement.textContent = currentLine;

                // If the word itself is too long, it will overflow.
                // A more complex solution would be character-by-character wrapping or hyphenation.
                // For now, we accept that very long single words might overflow.
            } else {
                currentLine = testLine;
                tspanElement.textContent = currentLine; // Update tspan with the current valid line
            }
        }

        // Vertical centering:
        const currentFontSize = currentSettings.fontSize || 12;
        const lineHeightFactor = 1.2;
        // const textBlockHeight = lineCount * currentFontSize * lineHeightFactor; // Already calculated for node height

        // Adjust the initial y attribute of the <text> element to center the block
        // The 'y' passed in is the center of the node.
        // We want the center of the text block to align with this 'y'.
        // So, the first tspan should start at y - textBlockHeight/2 + (fontSize*lineHeight)/2 (approx baseline of first line)
        // However, dominant-baseline:middle on text and dy on tspans handles much of this.
        // The main adjustment is for the initial y of the text element itself.
        // If dominant-baseline="middle", y is the vertical center.
        // Each tspan with dy="1.2em" shifts down.
        // The first tspan has dy="0" (or no dy, taking text's y).
        // So we need to shift the whole text element up by half of (number_of_lines - 1) * line_height
        // textElement.setAttribute('y', String(y - ((lineCount - 1) * fontSize * lineHeight) / 2));
        // Let's try with dominant-baseline: central and adjusting dy for the first line.
        // This is tricky. Let's rely on dominant-baseline: middle and dy.
        // The first line should not have a dy if y is the intended baseline for the first line.
        // If y is the center, then the first line's dy should pull it up.

        // Correct approach with dominant-baseline: middle for the <text> element:
        // The 'y' attribute of <text> is its vertical center.
        // Each <tspan> is relative to this.
        // The first <tspan> needs to be shifted up by half the total text block height,
        // then down by half a line height to position its own center at the start.
        // (lineCount / 2 - 0.5) gives the number of full line heights to shift up from center.
        // For dominant-baseline: middle, the y attribute of <text> is the center.
        // The first tspan needs to be shifted up by (lineCount - 1) / 2 * actual_line_height.
        const actualLineHeight = currentFontSize * lineHeightFactor;
        const initialDyOffset = -((lineCount - 1) / 2) * actualLineHeight;

        const firstTspan = textElement.querySelector('tspan'); // Should always exist due to addNewLine() logic
        if (firstTspan) { // Should always be true
            firstTspan.setAttribute('dy', `${initialDyOffset}px`);
        }

        textElement.setAttribute('y', String(y)); // Set the main y attribute for the text block's center
        textElement.style.fontSize = `${currentFontSize}px`; // Apply font size

        return textElement;
    }


    // --- Download SVG ---
    function downloadSvg() {
        console.log("Download SVG clicked.");
        if (!workflowDiagramSvg) {
            console.error("SVG element not found.");
            return;
        }

        // Get styles from stylesheet to inline them
        let cssStyles = "";
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i];
            if (sheet.href && sheet.href.includes('style.css')) { // Check if it's our stylesheet
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    for (let j = 0; j < rules.length; j++) {
                        cssStyles += rules[j].cssText + "\n";
                    }
                } catch (e) {
                    console.warn("Could not read CSS rules from stylesheet:", sheet.href, e);
                }
            }
        }

        const svgClone = workflowDiagramSvg.cloneNode(true);

        // Inline background color from the SVG element itself
        const svgBackgroundColor = workflowDiagramSvg.style.backgroundColor;
        if (svgBackgroundColor) {
            // If the first child is <defs>, insert rect after it. Otherwise, insert at the beginning.
            const firstChild = svgClone.firstChild;
            const backgroundRect = document.createElementNS(SVG_NS, 'rect');
            backgroundRect.setAttribute('width', '100%');
            backgroundRect.setAttribute('height', '100%');
            backgroundRect.setAttribute('fill', svgBackgroundColor);

            if (firstChild && firstChild.nodeName.toLowerCase() === 'defs') {
                svgClone.insertBefore(backgroundRect, firstChild.nextSibling);
            } else {
                svgClone.insertBefore(backgroundRect, firstChild);
            }
        }


        // Add styles to the cloned SVG
        const styleElement = document.createElementNS(SVG_NS, 'style');
        styleElement.textContent = cssStyles;
        svgClone.insertBefore(styleElement, svgClone.firstChild);


        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgClone);

        // Add XML declaration and DOCTYPE for better compatibility
        svgString = '<?xml version="1.0" standalone="no"?>\r\n' +
                    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\r\n' +
                    svgString;

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'workflow_diagram.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("SVG download initiated.");
    }


    // --- Event Listeners ---
    workflowSelect.addEventListener('change', (event) => {
        loadWorkflow(event.target.value);
    });

    colorSchemaSelect.addEventListener('change', () => {
        updateColorSchemaPreview(); // This already calls renderWorkflow if data exists
    });

    horizontalSpacingInput.addEventListener('input', () => { // Use 'input' for more responsive updates
        const newHSpacing = parseInt(horizontalSpacingInput.value);
        if (!isNaN(newHSpacing) && newHSpacing >= parseInt(horizontalSpacingInput.min)) {
            currentSettings.hSpacing = newHSpacing;
            if (currentWorkflowData) {
                renderWorkflow(currentWorkflowData, currentSettings);
            }
        }
    });

    verticalSpacingInput.addEventListener('input', () => { // Use 'input' for more responsive updates
        const newVSpacing = parseInt(verticalSpacingInput.value);
        if (!isNaN(newVSpacing) && newVSpacing >= parseInt(verticalSpacingInput.min)) {
            currentSettings.vSpacing = newVSpacing;
            if (currentWorkflowData) {
                renderWorkflow(currentWorkflowData, currentSettings);
            }
        }
    });

    fontSizeInput.addEventListener('input', () => {
        const newFontSize = parseInt(fontSizeInput.value);
        if (!isNaN(newFontSize) && newFontSize >= parseInt(fontSizeInput.min) && newFontSize <= parseInt(fontSizeInput.max)) {
            currentSettings.fontSize = newFontSize;
            if (currentWorkflowData) {
                rerenderCurrentWorkflow();
            }
        }
    });

    downloadSvgButton.addEventListener('click', downloadSvg);

    // --- Initialization ---
    populateWorkflowSelect();
    populateColorSchemaDropdown();
    updateColorSchemaPreview(); // Set initial preview and colors

    // Initial load (load the first workflow in the list)
    if (availableWorkflows.length > 0) {
        workflowSelect.value = availableWorkflows[0].path; // Set dropdown to first workflow
        loadWorkflow(availableWorkflows[0].path);
    } else {
        console.warn("No workflows defined in availableWorkflows array.");
        workflowDiagramSvg.innerHTML = `<text x="20" y="40" fill="red">No workflows available to load.</text>`;
    }

    console.log("app.js loaded and initialized.");
});
