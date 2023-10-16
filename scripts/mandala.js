let nPoints = 12;  // Number of points
let nLayers = 5;   // Number of layers
let radius = 400;  // Initial radius
let cStart, cEnd; // Color arrays
let lerpAmts; // Color interpolation
let rotating = false;
let rotationAngles = Array(9).fill(0);
let rotationSpeed = 0.005;


function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  strokeWeight(2);
  noFill();
  
  // Each layer gets it's own color.
  cStart = new Array(nLayers);
  cEnd = new Array(nLayers);
  lerpAmts = new Array(nLayers);
  for (let i = 0; i < nLayers; i++) {
    cStart[i] = color(random(255), random(255), random(255));
    cEnd[i] = color(random(255), random(255), random(255));
    lerpAmts[i] = 0;
  }
}

function draw() {
  background(0);
  translate(width / 2, height / 2);

  // Precompute trigonometric values
  let cosValues = new Array(nPoints);
  let sinValues = new Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    let angle = TWO_PI / nPoints * i;
    cosValues[i] = cos(angle);
    sinValues[i] = sin(angle);
  }
  
  //Inputs
  let distToCenter = int(dist(mouseX, mouseY, width / 2, height / 2));
  let step = int(map(distToCenter, 0, width / sqrt(2), 2, nPoints)); // Calculate step once
  
  //Layers
  for(let layer = 0; layer < nLayers; layer++) {
    push(); //Save layer state

    // Per-layer rotation
    if (rotating) {
        let direction = (layer % 2 === 0) ? 1 : -1; // Alternate
        rotationAngles[layer] += rotationSpeed * direction;
        rotate(rotationAngles[layer]);
    }

    let thisRadius = map(layer, 0, nLayers, radius, 0);
    if (lerpAmts[layer] >= 1) {
      lerpAmts[layer] = 0;
      cStart[layer] = cEnd[layer];
      cEnd[layer] = color(random(255), random(255), random(255));
    }
    //Colors
    let lerpedColor = lerpColor(cStart[layer], cEnd[layer], lerpAmts[layer]);
    stroke(lerpedColor);
    lerpAmts[layer] += 0.05;
    
    //Points
    for (let i = 0; i < nPoints; i++) {
      let x = cosValues[i] * thisRadius;
      let y = sinValues[i] * thisRadius;
      
      point(x, y);
      
      // Connect to a point `step` positions ahead, wrapping around at nPoints
      let next_i = (i + step) % nPoints;
      let next_x = cosValues[next_i] * thisRadius;
      let next_y = sinValues[next_i] * thisRadius;
      
      line(x, y, next_x, next_y);
    }

    pop(); //Restore layer state
  }

  fill(255);
//   let fps = int(frameRate());
  text("Controls: \n\n1-9\nmousewheel\nmouse position\nspacebar\nclick to fullscreen", 20 - width / 2, 20 - height / 2);
}

// Toggle fullscreen
function mousePressed() {
    let fs = fullscreen();
    fullscreen(!fs);
}

// Handle resizing after fs toggle (or otherwise)
function windowResized() {
    if (fullscreen()) {
        resizeCanvas(displayWidth, displayHeight);
    } else {
        resizeCanvas(windowWidth, windowHeight);
    }
}

//Interactive complexity
function keyPressed() {
    if (key >= '1' && key <= '9') {
      let newLayers = int(key);
      
      // If increasing the number of layers, add new colors and lerp amounts
      while (newLayers > cStart.length) {
        cStart.push(color(random(255), random(255), random(255)));
        cEnd.push(color(random(255), random(255), random(255)));
        lerpAmts.push(0);
      }
      
      // If decreasing the number of layers, remove excess colors and lerp amounts
      while (newLayers < cStart.length) {
        cStart.pop();
        cEnd.pop();
        lerpAmts.pop();
      }
      
      nLayers = newLayers;
    }

    if (key == " "){
        rotating = !rotating;
    }
  }

function mouseWheel(event) {
    nPoints += event.delta > 0 ? -1 : 1;
    nPoints = constrain(nPoints, 2, 100); // Keep nPoints between 2 and 100

    // Ensure step doesn't exceed nPoints - 1
    let distToCenter = int(dist(mouseX, mouseY, width / 2, height / 2));
    step = int(map(distToCenter, 0, width / sqrt(2), 2, nPoints - 1));
}
  
