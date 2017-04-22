var start = new Date();
var isDown = false;
var world = {};

const server = "http://localhost:15000/api/world/";

window.onload = function() {
  if (typeof worldId === "undefined") worldId = "1";
  getWorld(worldId);
};

function sendAction() {
  var result = {};
  var req = new XMLHttpRequest();
  req.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      console.log(this);
    } else if (this.readyState == 4) {
      console.error(this);
    }
  };
  req.open("PUT", server + world.id, true);
  req.responseType = "json";
  req.setRequestHeader("Content-Type", "application/json");
  req.send(
    JSON.stringify({
      build_settlement: {
        lon: -89.0,
        lat: 89.0
      }
    })
  );
}

function getResource(
  url,
  resourceType,
  responseType,
  successCallback,
  errorCallback
) {
  var result = {};
  var req = new XMLHttpRequest();
  req.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      successCallback(this[responseType]);
    } else if (this.readyState == 4) {
      errorCallback(this);
    }
  };
  req.open("GET", url, true);
  req.responseType = resourceType;
  req.send();
}

function setStatusOverlay(text) {
  document.getElementById("coordsOverlay").innerHTML = text;
}

function getWorld(worldId) {
  setStatusOverlay("Requesting world " + worldId);

  var interval;
  function pollForWorld() {
    console.log("Polling for world " + worldId);
    getResource(
      server + worldId,
      "json",
      "response",
      function(json) {
        if (json.result !== "success") {
          clearInterval(interval);
          setStatusOverlay("Error: " + JSON.stringify(json, null, 2));
          console.error(json);
        } else {
          if (json.world.status == "complete") {
            world = json.world;
            clearInterval(interval);
            setStatusOverlay("Rendering " + world.name);
            getWorldFeatures();
          } else {
            setStatusOverlay(
              json.world.name + " is " + json.world.status + "..."
            );
          }
        }
      },
      console.error
    );
  }
  interval = setInterval(pollForWorld, 1000);
}

function getWorldFeatures() {
  getResource(
    server + world.id + "/structures",
    "arraybuffer",
    "response",
    buildWorld,
    console.error
  );
  getResource(
    server + world.id + "/features",
    "json",
    "response",
    mergeFeaturesIntoWorld,
    console.error
  );
  getResource(
    server + world.id + "/points_of_interest",
    "json",
    "response",
    mergePointsOfInterestIntoWorld,
    console.error
  );
}

function addPointsOfInterestToWorld(unsetPointsOfInterest) {
  for (var i = 0; i < unsetPointsOfInterest.length; i++) {
    var poi = unsetPointsOfInterest[i];
    index = getCellByCoords(world.polygons, poi.longitude, poi.latitude);
    if (world.polygons[i].hasOwnProperty("pointsOfInterest")) {
      world.polygons[i].pointsOfInterest.push(poi);
    } else {
      world.polygons[i].pointsOfInterest = [poi];
    }
  }
  webgl.updatePolygons(world.polygons);
}

function addFeaturesToWorld(unsetFeatures) {
  var features = {};
  for (var i = 0; i < unsetFeatures.cells.length; i++) {
    world.cells[i].features = unsetFeatures.cells[i];
    var featureKeys = Object.keys(world.cells[i].features);
    for (var j = 0; j < featureKeys.length; j++) {
      var key = featureKeys[j];
      var featureMinMax = features[key];
      if (typeof featureMinMax === "undefined") {
        featureMinMax = { name: key, min: 0.0, max: 0.0 };
      }
      var value = world.cells[i].features[key];
      if (featureMinMax.min > value) featureMinMax.min = value;
      if (featureMinMax.max < value) featureMinMax.max = value;
      features[key] = featureMinMax;
    }
  }
  var featureKeys = Object.keys(features);
  for (var i = 0; i < featureKeys.length; i++) {
    var feature = features[featureKeys[i]];
    feature.colour = colourmaps.getMap("chloropleth", {
      buckets: 50,
      min: feature.min,
      max: feature.max
    });
    features[featureKeys[i]] = feature;
  }

  for (var i = 0; i < unsetFeatures.paths.length; i++) {
    world.paths[i].features = unsetFeatures.paths[i];
  }

  world.features = features;
  wheeler.getPolygons(world);
  webgl.updatePolygons(world.polygons);
  updateColourSelector(features);
}

function mergeFeaturesIntoWorld(json) {
  if (
    world.hasOwnProperty("cells") && world.cells[0].hasOwnProperty("features")
  ) {
    return;
  } else if (world.hasOwnProperty("cells")) {
    addFeaturesToWorld(json.features);
  } else {
    world.unsetFeatures = json.features;
  }
}

function mergePointsOfInterestIntoWorld(json) {
  if (
    world.hasOwnProperty("cells") &&
    world.cells[0].hasOwnProperty("points_of_interest")
  ) {
    return;
  } else if (world.hasOwnProperty("cells")) {
    addPointsOfInterestToWorld(json.points_of_interest);
  } else {
    world.unsetPointsOfInterest = json.points_of_interest;
  }
}

function buildWorld(response) {
  if (world.hasOwnProperty("cells")) {
    console.error("World already built!");
    return;
  }

  wheeler.decode(response, world);

  if (world.hasOwnProperty("unsetFeatures")) {
    addFeaturesToWorld(world.unsetFeatures);
    delete world.unsetFeatures;
  }
  if (world.hasOwnProperty("unsetPointsOfInterest")) {
    addPointsOfInterestToWorld(world.unsetPointsOfInterest);
    delete world.unsetPointsOfInterest;
  }
  renderWorld();
}

function renderWorld() {
  var canvas = resizeCanvas();
  webgl.initialize(canvas, world.polygons, world.paths);
  console.log("First render: " + (new Date() - start) + " ms");

  setStatusOverlay("World " + world.id + " is ready to explore!");

  window.addEventListener("wheel", changeZoom, false);
  window.addEventListener("resize", resizeCanvas, false);
  window.addEventListener("mousemove", pan, false);
  canvas.addEventListener("mousemove", updateHud, false);
  window.addEventListener(
    "mousedown",
    function() {
      isDown = true;
    },
    false
  );
  window.addEventListener(
    "mouseup",
    function() {
      isDown = false;
    },
    false
  );
}

function resizeCanvas(e) {
  var width = window.innerWidth;
  var height = window.innerHeight;

  var canvas = document.getElementById("canvas");
  canvas.setAttribute("width", width);
  canvas.setAttribute("height", height);

  if (typeof e !== "undefined")
    webgl.updateViewport(null, null, null, null, null, width, height);
  return canvas;
}

function changeZoom(e) {
  webgl.updateViewport(e.x, e.y, -e.deltaY);
}

function pan(e) {
  if (isDown) webgl.updateViewport(null, null, null, e.movementX, -e.movementY);
}

function getCellByCoords(longitude, latitude) {
  var index = -1;
  for (i = 0; i < world.polygons.length; i++) {
    if (pointInPolygon(longitude, longitude, world.polygons[i])) {
      if (world.polygons[i].hasOwnProperty("index")) {
        index = world.polygons[i].index;
      } else {
        index = i;
      }
      break;
    }
  }
  return index;
}

function updateHud(e) {
  var canvas = document.getElementById("canvas");
  var point = webgl.getLatLon(e.x, e.y);
  var lon = point[0];
  var lat = point[1];

  var index = getCellByCoords(lon, lat);
  if (index == -1) return;

  var cell = world.cells[i];

  var latlonElement = document.getElementById("coordsOverlay");
  latlonElement.innerHTML = "LatLon: (" +
    lat.toFixed(6) +
    ", " +
    lon.toFixed(6) +
    ")";
  var altElement = document.getElementById("altitudeOverlay");
  if (cell && cell.hasOwnProperty("features")) {
    altElement.innerHTML = "Alt: " + cell.features.terrain_altitude.toFixed(2);
  }
  if (cell && cell.hasOwnProperty("features")) {
    var featuresElement = document.getElementById("features");
    var c = "rgb(" +
      world.colours[cell.colour][0] +
      "," +
      world.colours[cell.colour][1] +
      "," +
      world.colours[cell.colour][2] +
      ")";
    featuresElement.innerHTML = JSON.stringify(
      world.cells[i].features,
      null,
      2
    );
    latlonElement.style.color = c;
    altElement.style.color = c;
    featuresElement.style.color = c;
  }
}

function updateColourSelector(features) {
  var keys = Object.keys(features);
  var colourmaps = document.getElementById("colourmapSelect");
  while (colourmaps.children.length > 1) {
    colourmaps.removeChild(colourmaps.lastChild);
  }
  colourmaps.onchange = function(e) {
    webgl.recolour(e.srcElement.value);
  };
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].slice(keys[i].length - 3) == "_id") continue;
    var element = document.createElement("option");
    element.setAttribute("value", keys[i]);
    element.innerHTML = keyToReadableValue(keys[i]);
    colourmaps.appendChild(element);
  }
}

function keyToReadableValue(key) {
  key = key.replace("_", " ");
  key = key[0].toUpperCase() + key.slice(1);
  return key;
}

function pointInPolygon(x, y, vertices) {
  var boundingBox = vertices.boundingBox;
  if (
    x < vertices.boundingBox[0] ||
    x > vertices.boundingBox[1] ||
    y < vertices.boundingBox[2] ||
    y > vertices.boundingBox[3]
  )
    return false;
  var inside = false;
  for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    var xi = vertices[i][0], yi = vertices[i][1];
    var xj = vertices[j][0], yj = vertices[j][1];

    var intersect = yi > y != yj > y &&
      x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
