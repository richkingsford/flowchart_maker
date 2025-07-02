document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const colorSchemaSelect = document.getElementById('colorSchemaSelect');
    const colorSchemaPreview = document.getElementById('colorSchemaPreview');
    const horizontalSpacingInput = document.getElementById('horizontalSpacing');
    const verticalSpacingInput = document.getElementById('verticalSpacing');
    const downloadSvgButton = document.getElementById('downloadSvgButton');
    const workflowDiagramSvg = document.getElementById('workflowDiagram');

    // --- Color Schemas ---
    const colorSchemas = {
        default: {
            name: "Default",
            action: { fill: '#AEC6CF', stroke: '#7C98A5', text: '#000000' }, // Pastel Blue
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
        vSpacing: parseInt(verticalSpacingInput.value)
    };

    // --- Functions ---

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

    // --- Workflow Loading ---
    async function loadWorkflow(workflowFileName) {
        try {
            const response = await fetch(workflowFileName);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Assuming the workflow is the first property in the JSON object
            const workflowKey = Object.keys(data)[0];
            currentWorkflowData = data[workflowKey];
            console.log("Workflow data loaded:", currentWorkflowData);
            renderWorkflow(currentWorkflowData, currentSettings);
        } catch (error) {
            console.error("Error loading workflow:", error);
            workflowDiagramSvg.innerHTML = `<text x="20" y="40" fill="red">Error loading workflow: ${error.message}</text>`;
        }
    }

    // --- SVG Rendering Engine ---
    function renderWorkflow(workflowSteps, settings) {
        console.log("Rendering workflow with steps:", workflowSteps, "and settings:", settings);
        workflowDiagramSvg.innerHTML = ''; // Clear previous diagram
        workflowDiagramSvg.style.backgroundColor = settings.colors.background;


        if (!workflowSteps || workflowSteps.length === 0) {
            const textElement = document.createElementNS(SVG_NS, 'text');
            textElement.setAttribute('x', '20');
            textElement.setAttribute('y', '40');
            textElement.setAttribute('fill', settings.colors.action.text || 'black');
            textElement.textContent = "No workflow steps to display.";
            workflowDiagramSvg.appendChild(textElement);
            return;
        }

        const nodePositions = {}; // Stores { stepID: { x, y, width, height, centerX, centerY, levelX, levelY } }
        const nodeElements = {};  // Stores { stepID: svgElement }
        const nodePadding = { x: 20, y: 10 };
        const defaultNodeSize = { width: 160, height: 70 }; // Adjusted min size for better text fit

        // Create a map for easy lookup and add parent/child info
        const stepsMap = new Map();
        workflowSteps.forEach(step => {
            stepsMap.set(step.stepID, { ...step, children: [], parents: [] });
        });

        // Populate children and parents
        workflowSteps.forEach(step => {
            const currentStepInfo = stepsMap.get(step.stepID);
            const nextSteps = [];
            if (step.type === 'decision' && step.options) {
                step.options.forEach(opt => nextSteps.push({id: opt.nextStepID, text: opt.decisionText}));
            } else if (step.nextStepID) {
                nextSteps.push({id: step.nextStepID});
            }

            nextSteps.forEach(next => {
                if (stepsMap.has(next.id)) {
                    currentStepInfo.children.push(next);
                    stepsMap.get(next.id).parents.push(step.stepID);
                }
            });
        });

        const positionedNodes = new Set();
        let globalMaxX = 0;
        let globalMaxY = 0;

        function calculateNodeSize(stepName) {
            // This is a simplified text width calculation.
            // For accurate results, measure text in the DOM or use a canvas.
            const avgCharWidth = 8; // Average character width for 12px font
            const maxCharsPerLine = Math.floor((defaultNodeSize.width - 2 * nodePadding.x) / avgCharWidth);
            const words = stepName.split(' ');
            let lines = 1;
            let currentLineLength = 0;
            words.forEach(word => {
                if (currentLineLength + word.length + (currentLineLength > 0 ? 1 : 0) > maxCharsPerLine) {
                    lines++;
                    currentLineLength = word.length;
                } else {
                    currentLineLength += word.length + (currentLineLength > 0 ? 1 : 0);
                }
            });
            const textHeight = lines * 12 * 1.2; // 12px font size, 1.2em line height
            const nodeHeight = Math.max(defaultNodeSize.height, textHeight + 2 * nodePadding.y);
            const nodeWidth = defaultNodeSize.width; // Keep width fixed for now for simplicity in grid
            return { width: nodeWidth, height: nodeHeight };
        }

        function positionNodesRecursive(stepID, currentX, currentY, levelX = 0, levelY = 0) {
            if (positionedNodes.has(stepID)) {
                // If node is already positioned, update its level if this path is 'deeper'
                // This helps in deciding which connection point to use for incoming lines for merged paths
                if (levelY > nodePositions[stepID].levelY) {
                    nodePositions[stepID].levelY = levelY;
                }
                 if (levelX > nodePositions[stepID].levelX) {
                    nodePositions[stepID].levelX = levelX;
                }
                return;
            }

            const step = stepsMap.get(stepID);
            if (!step) return;

            const { width, height } = calculateNodeSize(step.name);

            nodePositions[stepID] = { x: currentX, y: currentY, width, height, centerX: currentX + width / 2, centerY: currentY + height / 2, levelX, levelY };
            positionedNodes.add(stepID);

            globalMaxX = Math.max(globalMaxX, currentX + width);
            globalMaxY = Math.max(globalMaxY, currentY + height);

            const nextChildren = step.children;

            if (step.type === 'decision' && nextChildren.length > 0) {
                const optionYes = nextChildren.find(opt => opt.text && opt.text.toLowerCase() === 'yes');
                const optionNo = nextChildren.find(opt => opt.text && opt.text.toLowerCase() === 'no');
                const otherOptions = nextChildren.filter(opt => opt !== optionYes && opt !== optionNo);


                // "Yes" branch goes right
                if (optionYes && stepsMap.has(optionYes.id)) {
                    // Try to place it right, if that spot is "lower" than current node's y, use currentY for next
                    const nextNodeX = currentX + width + settings.hSpacing;
                    const nextNodeY = currentY;
                    positionNodesRecursive(optionYes.id, nextNodeX, nextNodeY, levelX + 1, levelY);
                }

                // "No" branch goes down
                if (optionNo && stepsMap.has(optionNo.id)) {
                    const nextNodeX = currentX; // Align with current decision node's X
                    // Find max Y of all nodes at current levelX or simply go below current.
                    // For simplicity, just go below current, might need refinement for complex layouts.
                    let maxYAtCurrentX = currentY + height;
                    Object.values(nodePositions).forEach(pos => {
                        if(pos.x === currentX && pos.y + pos.height > maxYAtCurrentX && pos !== nodePositions[stepID]) {
                            maxYAtCurrentX = pos.y + pos.height;
                        }
                    });

                    const nextNodeY = maxYAtCurrentX + settings.vSpacing;
                    positionNodesRecursive(optionNo.id, nextNodeX, nextNodeY, levelX, levelY + 1);
                }

                // Handle other options if any (e.g. place them below the "No" branch)
                 let yOffsetForOthers = currentY + height + settings.vSpacing;
                 if (optionNo && nodePositions[optionNo.id]) {
                     yOffsetForOthers = nodePositions[optionNo.id].y + nodePositions[optionNo.id].height + settings.vSpacing;
                 }

                otherOptions.forEach((opt, index) => {
                    if (stepsMap.has(opt.id)) {
                        const nextNodeX = currentX - settings.hSpacing; // Example: place to the left or further down
                        const nextNodeY = yOffsetForOthers + index * (defaultNodeSize.height + settings.vSpacing);
                        positionNodesRecursive(opt.id, nextNodeX, nextNodeY, levelX -1, levelY + 1 + index);
                    }
                });


            } else if (nextChildren.length > 0) { // Action or Terminal with a next step
                const nextStepInfo = nextChildren[0]; // Assuming single next step for action/terminal
                if (stepsMap.has(nextStepInfo.id)) {
                    // Default: move diagonally down-right
                    let nextNodeX = currentX + width / 4 + settings.hSpacing / 2; // Slight right shift
                    let nextNodeY = currentY + height + settings.vSpacing;

                    // A very basic attempt to avoid collision by checking if next X,Y is too close to an existing node
                    // This is not a full collision detection system.
                    let potentialCollision = false;
                    for (const [pid, ppos] of Object.entries(nodePositions)) {
                        if (pid !== stepID && pid !== nextStepInfo.id) {
                             if (Math.abs(ppos.x - nextNodeX) < defaultNodeSize.width && Math.abs(ppos.y - nextNodeY) < defaultNodeSize.height) {
                                potentialCollision = true;
                                break;
                             }
                        }
                    }

                    if(potentialCollision) { // If collision, try to move further right or down
                        // Heuristic: if the target node is to the left (loop), keep X, just increase Y
                        const targetNode = nodePositions[nextStepInfo.id];
                        if (targetNode && targetNode.x < currentX) {
                            nextNodeX = currentX;
                            nextNodeY = Math.max(nextNodeY, targetNode.y - height - settings.vSpacing); // Ensure enough space for line
                        } else {
                             // Try shifting right more significantly if it's not a loop back.
                             nextNodeX = currentX + width + settings.hSpacing;
                        }
                    }


                    positionNodesRecursive(nextStepInfo.id, nextNodeX, nextNodeY, levelX + 1, levelY + 1);
                }
            }
        }

        // Find starting nodes (nodes with no parents or parents not in current workflow)
        const startNodes = Array.from(stepsMap.values()).filter(s => s.parents.length === 0 || s.parents.every(pID => !stepsMap.has(pID)));
        if (startNodes.length === 0 && workflowSteps.length > 0) { // Fallback for circular dependencies or single node
            startNodes.push(stepsMap.get(workflowSteps[0].stepID));
        }

        let initialX = 50;
        let initialY = 50;
        startNodes.forEach((startNode, index) => {
            // Stagger start nodes slightly if multiple are present
            positionNodesRecursive(startNode.stepID, initialX + index * (defaultNodeSize.width + settings.hSpacing), initialY, index, 0);
        });

        // Draw nodes
        Array.from(stepsMap.values()).forEach(step => {
            if (!nodePositions[step.stepID]) {
                console.warn(`Node ${step.stepID} (${step.name}) was not positioned. Skipping.`);
                return; // Skip if not positioned (e.g. disconnected part of graph)
            }

            const pos = nodePositions[step.stepID];
            const nodeColors = settings.colors[step.type] || settings.colors.action;
            const nodeGroup = document.createElementNS(SVG_NS, 'g');
            nodeGroup.setAttribute('class', `node-group ${step.type}-node`);
            nodeGroup.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

            let shape;
            if (step.type === 'decision') {
                shape = document.createElementNS(SVG_NS, 'polygon');
                shape.setAttribute('points', `${pos.width/2},0 ${pos.width},${pos.height/2} ${pos.width/2},${pos.height} 0,${pos.height/2}`);
            } else if (step.type === 'terminal') {
                shape = document.createElementNS(SVG_NS, 'ellipse');
                shape.setAttribute('cx', pos.width / 2);
                shape.setAttribute('cy', pos.height / 2);
                shape.setAttribute('rx', pos.width / 2);
                shape.setAttribute('ry', pos.height / 2);
            } else { // action
                shape = document.createElementNS(SVG_NS, 'rect');
                shape.setAttribute('width', pos.width);
                shape.setAttribute('height', pos.height);
                shape.setAttribute('rx', '5');
                shape.setAttribute('ry', '5');
            }
            shape.setAttribute('class', 'node-shape');
            shape.setAttribute('fill', nodeColors.fill);
            shape.setAttribute('stroke', nodeColors.stroke);
            nodeGroup.appendChild(shape);

            const textElement = createSvgText(step.name, pos.width / 2, pos.height / 2, pos.width - nodePadding.x * 1.5, nodeColors.text);
            nodeGroup.appendChild(textElement);
            workflowDiagramSvg.appendChild(nodeGroup);
            nodeElements[step.stepID] = nodeGroup;
        });

        // Draw lines
        Array.from(stepsMap.values()).forEach(step => {
            const startPos = nodePositions[step.stepID];
            if (!startPos) return;

            const children = step.children;
            children.forEach(childInfo => {
                const endPos = nodePositions[childInfo.id];
                if (!endPos) return;

                const line = document.createElementNS(SVG_NS, 'line');
                let x1 = startPos.centerX;
                let y1 = startPos.centerY;
                let x2 = endPos.centerX;
                let y2 = endPos.centerY;

                // Adjust line start/end points to connect to node borders
                // This is a simplified approach. More robust would be intersection of line with shape.
                if (step.type === 'decision') {
                    if (childInfo.text && childInfo.text.toLowerCase() === 'yes') { // Right exit
                        x1 = startPos.x + startPos.width;
                        y1 = startPos.centerY;
                    } else { // Bottom exit for "No" or other
                        x1 = startPos.centerX;
                        y1 = startPos.y + startPos.height;
                    }
                } else { // Default bottom exit for actions/terminals
                    x1 = startPos.centerX;
                    y1 = startPos.y + startPos.height;
                }

                // Default top entry for next node
                x2 = endPos.centerX;
                y2 = endPos.y;

                // If it's a loop back to an earlier node (higher up)
                if (endPos.y < startPos.y && Math.abs(endPos.x - startPos.x) < startPos.width) {
                     x1 = startPos.centerX; // Exit from bottom
                     y1 = startPos.y + startPos.height;
                     x2 = endPos.centerX; // Enter from top
                     y2 = endPos.y;
                     // Could add more sophisticated routing for loops here, e.g. using side connectors
                } else if (endPos.x < startPos.x) { // Connecting to a node to the left
                    x1 = startPos.x;
                    y1 = startPos.centerY;
                    x2 = endPos.x + endPos.width;
                    y2 = endPos.centerY;
                } else if (endPos.x > startPos.x + startPos.width) { // Connecting to a node to the right
                    x1 = startPos.x + startPos.width;
                    y1 = startPos.centerY;
                    x2 = endPos.x;
                    y2 = endPos.centerY;
                }


                line.setAttribute('x1', x1);
                line.setAttribute('y1', y1);
                line.setAttribute('x2', x2);
                line.setAttribute('y2', y2);
                line.setAttribute('stroke', settings.colors.line);
                line.setAttribute('class', 'line-connector');
                line.setAttribute('marker-end', 'url(#arrowhead)');
                workflowDiagramSvg.insertBefore(line, workflowDiagramSvg.firstChild);

                if (childInfo.text) { // Decision line label
                    const labelX = (x1 + x2) / 2 + (x1 > x2 || y1 > y2 ? -5 : 5); // slight offset
                    const labelY = (y1 + y2) / 2 - 5; // slight offset
                    const textLabel = document.createElementNS(SVG_NS, 'text');
                    textLabel.setAttribute('x', labelX);
                    textLabel.setAttribute('y', labelY);
                    textLabel.setAttribute('fill', settings.colors.lineLabel);
                    textLabel.setAttribute('class', 'line-label');
                    textLabel.textContent = childInfo.text;
                    workflowDiagramSvg.insertBefore(textLabel, workflowDiagramSvg.firstChild);
                }
            });
        });

        // Add arrowhead marker definition (if not already there, but clearing SVG so it's fine)
        const defs = document.createElementNS(SVG_NS, 'defs');
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

        // Check if defs already exists, if not create it
        let defs = workflowDiagramSvg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            workflowDiagramSvg.insertBefore(defs, workflowDiagramSvg.firstChild);
        }

        // Remove old arrowhead if it exists to update color
        const oldMarker = defs.querySelector('#arrowhead');
        if (oldMarker) {
            defs.removeChild(oldMarker);
        }
        defs.appendChild(marker);

        // Auto-sizing of SVG
        const padding = 50; // Padding around the content
        // Ensure globalMaxX and globalMaxY are valid numbers, default to minimum SVG size if no nodes
        const finalWidth = Object.keys(nodePositions).length > 0 ? globalMaxX + padding : 800;
        const finalHeight = Object.keys(nodePositions).length > 0 ? globalMaxY + padding : 600;

        workflowDiagramSvg.setAttribute('width', finalWidth);
        workflowDiagramSvg.setAttribute('height', finalHeight);
        workflowDiagramSvg.setAttribute('viewBox', `0 0 ${finalWidth} ${finalHeight}`);
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
        // Calculate the total height of the text block
        const fontSize = 12; // Assuming 12px font size from CSS
        const lineHeight = 1.2; // em
        const textBlockHeight = lineCount * fontSize * lineHeight;

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
        const initialDyOffset = -( (lineCount -1) / 2 ) * lineHeight * fontSize;
        const firstTspan = textElement.querySelector('tspan');
        if (firstTspan) {
            firstTspan.setAttribute('dy', `${initialDyOffset}px`);
        }
         textElement.setAttribute('y', String(y));


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

    downloadSvgButton.addEventListener('click', downloadSvg);

    // --- Initialization ---
    populateColorSchemaDropdown();
    updateColorSchemaPreview(); // Set initial preview and colors

    // Initial load
    loadWorkflow('workflows/qa_process.json');

    console.log("app.js loaded and initialized.");
});
