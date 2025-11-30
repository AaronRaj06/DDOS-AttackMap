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

    // RANDOM ATTACK GENERATOR for demo
    const createRandomArc = () => {
      const locations = [
        { name: 'USA', lat: 40.7128, lon: -74.0060 },
        { name: 'UK', lat: 51.5074, lon: -0.1278 },
        { name: 'Germany', lat: 52.5200, lon: 13.4050 },
        { name: 'France', lat: 48.8566, lon: 2.3522 },
        { name: 'Russia', lat: 55.7558, lon: 37.6173 },
        { name: 'China', lat: 39.9042, lon: 116.4074 },
        { name: 'Japan', lat: 35.6762, lon: 139.6503 },
        { name: 'India', lat: 28.6139, lon: 77.2090 },
        { name: 'Brazil', lat: -23.5505, lon: -46.6333 },
        { name: 'Australia', lat: -33.8688, lon: 151.2093 },
        { name: 'Canada', lat: 43.6532, lon: -79.3832 },
        { name: 'South Korea', lat: 37.5665, lon: 126.9780 },
      ];
      
      const colors = [0xff0000, 0xff6600, 0xffaa00, 0x00ff00];
      const src = locations[Math.floor(Math.random() * locations.length)];
      const dst = locations[Math.floor(Math.random() * locations.length)];
      
      if (src === dst) return; // Skip if same location
      
      const GLOBE_RADIUS = 2.0;
      const ARC_RADIUS = GLOBE_RADIUS + 0.02;
      
      const start = latLonToVector3(src.lat, src.lon, ARC_RADIUS);
      const end = latLonToVector3(dst.lat, dst.lon, ARC_RADIUS);
      
      const distance = start.distanceTo(end);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const arcHeight = GLOBE_RADIUS + Math.min(distance * 0.3, 0.6);
      mid.normalize().multiplyScalar(arcHeight);
      
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // Main arc
      const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.015, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const arc = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(arc);
      arcsRef.current.push(arc);
      
      // Glow
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
      
      console.log(`🎯 Random arc: ${src.name} → ${dst.name}`);
    };
    
    // Generate random arcs every 2 seconds continuously
    const generateArcs = () => {
      createRandomArc();
      setTimeout(generateArcs, 2000); // New arc every 2 seconds
    };
    
    setTimeout(generateArcs, 1000); // Start after 1 second

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

        // Fade out arcs over time (stay visible for ~7 seconds)
        if (arc.material && arc.material.transparent && arc.material.opacity > 0) {
          arc.material.opacity -= 0.0005; // Very slow fade
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
      window.removeEventListener('resize', handleWindowResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Create 3D TUBE arc when new event received
  useEffect(() => {
    console.log('🎯 Events received:', events.length);
    console.log('📊 Latest event:', events[events.length - 1]);

    if (!sceneRef.current) {
      console.log('❌ Scene not initialized');
      return;
    }

    if (events.length === 0) {
      console.log('⚠️ No events yet');
      return;
    }

    const latestEvent = events[events.length - 1];
    console.log('🔍 Event data:', {
      src: `${latestEvent.src_country} (${latestEvent.src_lat}, ${latestEvent.src_lon})`,
      dst: `${latestEvent.dst_country} (${latestEvent.dst_lat}, ${latestEvent.dst_lon})`,
      score: latestEvent.suspicious_score
    });

    if (!latestEvent.src_lat || !latestEvent.dst_lat) {
      console.log('❌ Missing coordinates!');
      return;
    }

    console.log('✅ Creating arc:', latestEvent.src_country, '→', latestEvent.dst_country);

    // Create arc curve - Place ABOVE globe surface
    const GLOBE_RADIUS = 2.0;
    const ARC_RADIUS = GLOBE_RADIUS + 0.02; // Just above surface
    
    const start = latLonToVector3(latestEvent.src_lat, latestEvent.src_lon, ARC_RADIUS);
    const end = latLonToVector3(latestEvent.dst_lat, latestEvent.dst_lon, ARC_RADIUS);

    console.log('📍 Start:', start, 'End:', end);

    const distance = start.distanceTo(end);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const arcHeight = GLOBE_RADIUS + Math.min(distance * 0.25, 0.5); // Cap max height
    mid.normalize().multiplyScalar(arcHeight);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const color = getThreatColor(latestEvent.suspicious_score || 0.5);
    
    console.log('🎨 Color:', `#${color.toString(16)}`);

    // Main arc tube - BRIGHT AND VISIBLE
    const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.03, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: false,
      opacity: 1.0,
    });

    const arc = new THREE.Mesh(tubeGeometry, tubeMaterial);
    sceneRef.current.add(arc);
    arcsRef.current.push(arc);

    // Glow layer
    const glowGeo = new THREE.TubeGeometry(curve, 64, 0.05, 8, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    sceneRef.current.add(glow);
    arcsRef.current.push(glow);
    
    console.log('✨ Arc added');

    // Source marker - small elegant dot
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

    // Destination marker - red dot
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
    
    console.log('🎯 Markers added');

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
