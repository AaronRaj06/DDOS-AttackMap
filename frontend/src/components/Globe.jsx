import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStarfield from '../utils/getStarfield';
import { drawThreeGeo } from '../utils/threeGeoJSON';
import './Globe.css';

function Globe() {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.3);

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
      renderer.render(scene, camera);
      controls.update();
    }
    animate();

    // Handle window resize
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

  return <div ref={mountRef} className="globe-container" />;
}

export default Globe;
