import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from '../utils/getStarfield';
import { drawThreeGeo } from '../utils/threeGeoJSON';
import './Globe.css';

// Convert lat/lon to 3D coordinates on sphere
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));

  return new THREE.Vector3(x, y, z);
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
    const camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
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
    const geometry = new THREE.SphereGeometry(2);
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
    function animate() {
      requestAnimationFrame(animate);

      // Update arcs (fade out)
      arcsRef.current.forEach((arc, index) => {
        if (arc.material && arc.material.opacity > 0) {
          arc.material.opacity -= 0.002;
        } else if (arc.material) {
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
    console.log('🎯 Events:', events.length);

    if (!sceneRef.current || events.length === 0) return;

    const latestEvent = events[events.length - 1];
    if (!latestEvent.src_lat || !latestEvent.dst_lat) return;

    console.log('✅ Creating 3D TUBE arc:', latestEvent.src_country, '→', latestEvent.dst_country);

    // Create arc curve
    const start = latLonToVector3(latestEvent.src_lat, latestEvent.src_lon, 2.1);
    const end = latLonToVector3(latestEvent.dst_lat, latestEvent.dst_lon, 2.1);

    const distance = start.distanceTo(end);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const arcHeight = 2.1 + (distance * 0.5);
    mid.normalize().multiplyScalar(arcHeight);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const color = getThreatColor(latestEvent.suspicious_score || 0.5);

    // ✨ 3D TUBE GEOMETRY (visible!)
    const tubeGeometry = new THREE.TubeGeometry(curve, 50, 0.01, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
    });

    const arc = new THREE.Mesh(tubeGeometry, tubeMaterial);
    sceneRef.current.add(arc);
    arcsRef.current.push(arc);

    // Glow effect
    const glowGeo = new THREE.TubeGeometry(curve, 50, 0.015, 8, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    sceneRef.current.add(glow);
    arcsRef.current.push(glow);

    // Source marker
    const srcGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const srcMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
    const srcMarker = new THREE.Mesh(srcGeo, srcMat);
    srcMarker.position.copy(start);
    sceneRef.current.add(srcMarker);
    arcsRef.current.push(srcMarker);

    // Source glow
    const srcGlowGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const srcGlowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.3 });
    const srcGlow = new THREE.Mesh(srcGlowGeo, srcGlowMat);
    srcGlow.position.copy(start);
    sceneRef.current.add(srcGlow);
    arcsRef.current.push(srcGlow);

    // Destination marker
    const dstGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const dstMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1.0 });
    const dstMarker = new THREE.Mesh(dstGeo, dstMat);
    dstMarker.position.copy(end);
    sceneRef.current.add(dstMarker);
    arcsRef.current.push(dstMarker);

    // Destination glow
    const dstGlowGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const dstGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    const dstGlow = new THREE.Mesh(dstGlowGeo, dstGlowMat);
    dstGlow.position.copy(end);
    sceneRef.current.add(dstGlow);
    arcsRef.current.push(dstGlow);

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
