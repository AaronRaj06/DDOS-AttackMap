import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from '../utils/getStarfield';
import { drawThreeGeo } from '../utils/threeGeoJSON';
import './Globe.css';

// Convert lat/lon to 3D coordinates - EXACT match to threeGeoJSON.js
function latLonToVector3(lat, lon, radius) {
  // This is the EXACT formula from threeGeoJSON.js convertToSphereCoords
  const x = Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180) * radius;
  const y = Math.cos(lat * Math.PI / 180) * Math.sin(lon * Math.PI / 180) * radius;
  const z = Math.sin(lat * Math.PI / 180) * radius;
  
  // The GeoJSON container is rotated by container.rotation.x = -Math.PI * 0.5
  // So we need to rotate our coordinates the same way
  // Rotation around X-axis by -90 degrees: new_y = z, new_z = -y
  return new THREE.Vector3(x, z, -y);
}

// Get color based on threat score
function getThreatColor(score) {
  if (score >= 0.75) return 0xff0000; // Red - critical
  if (score >= 0.5) return 0xff6600;  // Orange - high
  if (score >= 0.25) return 0xffaa00; // Yellow - medium
  return 0x00ff00; // Green - low
}

function Globe({ events = [] }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const arcsRef = useRef([]);

  useEffect(() => {
    if (!mountRef.current) return;

    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.3);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;

    // Globe wireframe
    const geometry = new THREE.SphereGeometry(2, 32, 32);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
    });
    const edges = new THREE.EdgesGeometry(geometry, 1);
    const line = new THREE.LineSegments(edges, lineMat);
    scene.add(line);

    // Starfield
    const stars = getStarfield({ numStars: 1000 });
    scene.add(stars);

    // Location data with coordinates (same as backend eventGenerator.js)
    const LOCATIONS = [
      { code: 'US', name: 'United States', lat: 37.09024, lon: -95.712891 },
      { code: 'CN', name: 'China', lat: 35.86166, lon: 104.195397 },
      { code: 'RU', name: 'Russia', lat: 61.52401, lon: 105.318756 },
      { code: 'BR', name: 'Brazil', lat: -14.235004, lon: -51.92528 },
      { code: 'IN', name: 'India', lat: 20.593684, lon: 78.96288 },
      { code: 'DE', name: 'Germany', lat: 51.165691, lon: 10.451526 },
      { code: 'GB', name: 'United Kingdom', lat: 55.378051, lon: -3.435973 },
      { code: 'FR', name: 'France', lat: 46.227638, lon: 2.213749 },
      { code: 'KR', name: 'South Korea', lat: 35.907757, lon: 127.766922 },
      { code: 'JP', name: 'Japan', lat: 36.204824, lon: 138.252924 },
    ];

    const COLORS = [0xff0000, 0xff6600, 0xffaa00, 0x00ff00];

    // Function to create arc between two locations
    const createArc = (srcLoc, dstLoc) => {
      const GLOBE_RADIUS = 2.0;
      const ARC_RADIUS = GLOBE_RADIUS + 0.02;

      const start = latLonToVector3(srcLoc.lat, srcLoc.lon, ARC_RADIUS);
      const end = latLonToVector3(dstLoc.lat, dstLoc.lon, ARC_RADIUS);

      const distance = start.distanceTo(end);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const arcHeight = GLOBE_RADIUS + Math.min(distance * 0.3, 0.6);
      mid.normalize().multiplyScalar(arcHeight);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];

      // Main arc tube
      const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.015, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const arc = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(arc);
      arcsRef.current.push(arc);

      // Glow layer
      const glowGeo = new THREE.TubeGeometry(curve, 64, 0.025, 8, false);
      const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      scene.add(glow);
      arcsRef.current.push(glow);

      // Source marker
      const srcGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const srcMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const srcMarker = new THREE.Mesh(srcGeo, srcMat);
      srcMarker.position.copy(start);
      srcMarker.userData.isPulse = true;
      scene.add(srcMarker);
      arcsRef.current.push(srcMarker);

      // Destination marker
      const dstGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const dstMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1.0 });
      const dstMarker = new THREE.Mesh(dstGeo, dstMat);
      dstMarker.position.copy(end);
      dstMarker.userData.isPulse = true;
      scene.add(dstMarker);
      arcsRef.current.push(dstMarker);

      console.log(`🎯 Arc: ${srcLoc.code} → ${dstLoc.code}`);
    };

    // Generate random arc between two different locations
    const generateRandomArc = () => {
      const src = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      let dst = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      
      // Make sure source and destination are different
      while (dst.code === src.code) {
        dst = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      }
      
      createArc(src, dst);
    };

    // Generate arcs continuously - 1 arc every 2 seconds
    let arcIntervalId = null;
    
    const startArcGeneration = () => {
      arcIntervalId = setInterval(() => {
        generateRandomArc();
      }, 2000); // 1 arc every 2 seconds
    };

    // Generate first arc immediately, then start interval
    setTimeout(() => {
      generateRandomArc();
      startArcGeneration();
    }, 500);

    // Load GeoJSON
    fetch('/geojson/ne_110m_land.json')
      .then(response => response.json())
      .then(data => {
        const countries = drawThreeGeo({
          json: data,
          radius: 2,
          materialOptions: {
            color: 0x80FF80,
          },
        });
        scene.add(countries);
      })
      .catch(error => console.error('Error loading GeoJSON:', error));

    // Animation loop
    let clock = 0;
    function animate() {
      requestAnimationFrame(animate);
      clock += 0.01;

      // Update arcs with fade animation
      arcsRef.current.forEach((arc, index) => {
        if (arc.userData.isPulse) {
          // Pulsing effect for markers
          const scale = 1 + Math.sin(clock * 3) * 0.2;
          arc.scale.set(scale, scale, scale);
        }

        // Fade out arcs over time (stay visible for ~5 seconds)
        if (arc.material && arc.material.transparent && arc.material.opacity > 0) {
          arc.material.opacity -= 0.01; // Faster fade
        } else if (arc.material && arc.material.opacity <= 0) {
          scene.remove(arc);
          arcsRef.current.splice(index, 1);
        }
      });

      renderer.render(scene, camera);
      controls.update();
    }
    animate();

    //Handle window resize
    function handleWindowResize() {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener('resize', handleWindowResize);

    // Cleanup
    return () => {
      if (arcIntervalId) clearInterval(arcIntervalId);
      window.removeEventListener('resize', handleWindowResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Track processed events to avoid duplicates
  const processedEventsRef = useRef(new Set());

  // Create 3D arc when new event received from backend
  useEffect(() => {
    if (!sceneRef.current || events.length === 0) return;

    // Process all new events that haven't been processed yet
    events.forEach(event => {
      // Skip if already processed
      if (processedEventsRef.current.has(event.id)) return;
      processedEventsRef.current.add(event.id);
      
      // Debug: Log event to verify data
      console.log('🌍 Globe received event:', event);
      
      // Skip if missing coordinates
      if (!event.src_lat || !event.dst_lat) {
        console.log('❌ Missing coordinates in event');
        return;
      }
      
      console.log(`✅ Creating arc: ${event.src_country} → ${event.dst_country}`);

      // Create arc curve - Place ABOVE globe surface
      const GLOBE_RADIUS = 2.0;
      const ARC_RADIUS = GLOBE_RADIUS + 0.02;
      
      const start = latLonToVector3(event.src_lat, event.src_lon, ARC_RADIUS);
      const end = latLonToVector3(event.dst_lat, event.dst_lon, ARC_RADIUS);

      const distance = start.distanceTo(end);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const arcHeight = GLOBE_RADIUS + Math.min(distance * 0.25, 0.5);
      mid.normalize().multiplyScalar(arcHeight);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const color = getThreatColor(event.suspicious_score || 0.5);

      // Main arc tube
      const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.02, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });
      const arc = new THREE.Mesh(tubeGeometry, tubeMaterial);
      sceneRef.current.add(arc);
      arcsRef.current.push(arc);

      // Glow layer
      const glowGeo = new THREE.TubeGeometry(curve, 64, 0.035, 8, false);
      const glowMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      sceneRef.current.add(glow);
      arcsRef.current.push(glow);

      // Source marker
      const srcGeo = new THREE.SphereGeometry(0.03, 16, 16);
      const srcMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
      const srcMarker = new THREE.Mesh(srcGeo, srcMat);
      srcMarker.position.copy(start);
      srcMarker.userData.isPulse = true;
      sceneRef.current.add(srcMarker);
      arcsRef.current.push(srcMarker);

      // Source glow
      const srcGlowGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const srcGlowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
      const srcGlow = new THREE.Mesh(srcGlowGeo, srcGlowMat);
      srcGlow.position.copy(start);
      srcGlow.userData.isPulse = true;
      sceneRef.current.add(srcGlow);
      arcsRef.current.push(srcGlow);

      // Destination marker
      const dstGeo = new THREE.SphereGeometry(0.035, 16, 16);
      const dstMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1.0 });
      const dstMarker = new THREE.Mesh(dstGeo, dstMat);
      dstMarker.position.copy(end);
      dstMarker.userData.isPulse = true;
      sceneRef.current.add(dstMarker);
      arcsRef.current.push(dstMarker);

      // Destination glow
      const dstGlowGeo = new THREE.SphereGeometry(0.06, 16, 16);
      const dstGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4 });
      const dstGlow = new THREE.Mesh(dstGlowGeo, dstGlowMat);
      dstGlow.position.copy(end);
      dstGlow.userData.isPulse = true;
      sceneRef.current.add(dstGlow);
      arcsRef.current.push(dstGlow);
    });

  }, [events]);

  // Attack type colors
  const attackTypes = {
    'ntp-amp': '#ff0000',
    'dns-amp': '#ff6600',
    'syn-flood': '#ff00ff',
    'udp-flood': '#00ffff',
    'http-flood': '#ffff00',
    'ssdp-amp': '#00ff00',
    'chargen-amp': '#ff66ff',
  };

  return (
    <div className="globe-visualization">
      <div ref={mountRef} className="globe-container" />

      <div className="attack-legend">
        <h4>Attack Types</h4>
        {Object.entries(attackTypes).map(([type, color]) => (
          <div key={type} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: color }} />
            <span className="legend-label">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Globe;
