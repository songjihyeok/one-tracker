import * as THREE from 'three';

/** Meter-scale vessel. +Y is the bow, +Z is up, +X is starboard. */
export type ShipModel = { group: THREE.Group; wake: THREE.ShaderMaterial };

function paintTexture(color: string, label = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 12) {
    context.fillStyle = 'rgba(255,255,255,.13)';
    context.fillRect(x, 2, 3, 124);
    context.fillStyle = 'rgba(0,0,0,.18)';
    context.fillRect(x + 5, 2, 2, 124);
  }
  context.strokeStyle = 'rgba(0,0,0,.45)';
  context.lineWidth = 4;
  context.strokeRect(1, 1, 510, 126);
  if (label) {
    context.fillStyle = '#ffffff';
    context.font = 'italic 900 67px Arial';
    context.textAlign = 'center';
    context.fillText('ONE', 256, 86);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function lettering(text: string, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.font = 'italic 900 172px Arial';
  context.textAlign = 'center';
  context.fillText(text, 512, 174);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}

function hullGeometry(zBottom: number, zTop: number, bottomScale: number) {
  const sections = [[-180, 15], [-172, 23], [-150, 26], [78, 26], [121, 22], [153, 15], [175, 6], [189, .15]];
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [y, halfWidth] of sections) {
    vertices.push(-halfWidth * bottomScale, y, zBottom, halfWidth * bottomScale, y, zBottom, halfWidth, y, zTop, -halfWidth, y, zTop);
  }
  for (let section = 0; section < sections.length - 1; section++) {
    for (let edge = 0; edge < 4; edge++) {
      const a = section * 4 + edge;
      const b = section * 4 + (edge + 1) % 4;
      indices.push(a, b, b + 4, a, b + 4, a + 4);
    }
  }
  indices.push(0, 3, 2, 0, 2, 1);
  const end = (sections.length - 1) * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  // All rings are listed clockwise when seen from outside; reverse triangle winding.
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const wakeVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const wakeFragment = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uStrength;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  void main(){
    float aft=1.-vUv.y;
    float x=abs(vUv.x-.5)*2.;
    float spread=.08+aft*.8;
    float ripple=sin(aft*170.-uTime*5.+x*19.)*.018;
    float edge=exp(-pow((x-spread+ripple)*35.,2.));
    float core=exp(-x*x/(.006+aft*.1))*.55;
    float churn=noise(vec2(vUv.x*95.,vUv.y*170.+uTime*2.));
    float fade=smoothstep(0.,.05,aft)*pow(1.-aft,1.4);
    float alpha=(edge*.7+core*.7)*fade*(.24+churn*.8)*uStrength;
    gl_FragColor=vec4(mix(vec3(.36,.73,.77),vec3(.96,.99,1.),churn),alpha);
  }`;

export function createShipModel(name: string, variation = 0): ShipModel {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: '#b91772', roughness: .52, metalness: .25 });
  const dark = new THREE.MeshStandardMaterial({ color: '#162734', roughness: .55, metalness: .3 });
  const deck = new THREE.MeshStandardMaterial({ color: '#82677b', roughness: .84 });
  const cream = new THREE.MeshStandardMaterial({ color: '#edece5', roughness: .46, metalness: .12 });
  const gray = new THREE.MeshStandardMaterial({ color: '#65737a', roughness: .5, metalness: .5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#173b49', roughness: .17, metalness: .78, emissive: '#264955', emissiveIntensity: .2 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ff7b28', roughness: .5 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function box(w: number, length: number, h: number, x: number, y: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(w, length, h);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  group.add(new THREE.Mesh(hullGeometry(-5, 2.8, .7), dark));
  group.add(new THREE.Mesh(hullGeometry(2.8, 19.5, .9), hull));
  const deckMesh = new THREE.Mesh(hullGeometry(19.3, 20, .99), deck);
  group.add(deckMesh);
  // A raised forecastle and the stern mooring deck are visible beyond the stacks.
  box(25, 24, 2, 0, 155, 21, hull);
  box(37, 13, 2, 0, -169, 20.6, cream);

  const palette = ['#c72585', '#e243a0', '#e0e0d3', '#203d52', '#7e9c9c', '#7e304e'];
  const containerGeometry = new THREE.BoxGeometry(2.43, 12.1, 2.58);
  const placements: { color: number; x: number; y: number; z: number }[] = [];
  for (let bay = 0; bay < 23; bay++) {
    const y = -151 + bay * 13;
    if (y > -68 && y < -44) continue;
    const columns = y > 122 ? 10 : y > 96 ? 14 : 18;
    for (let column = 0; column < columns; column++) {
      const stacks = (bay + column + variation) % 9 === 0 ? 5 : 7;
      for (let level = 0; level < stacks; level++) {
        const hash = (bay * 73 + column * 31 + level * 11 + variation * 13) % 29;
        const color = hash < 15 ? 0 : hash < 18 ? 1 : hash < 22 ? 2 : hash < 25 ? 3 : hash < 27 ? 4 : 5;
        placements.push({ color, x: (column - (columns - 1) / 2) * 2.53, y, z: 21.5 + level * 2.72 });
      }
    }
  }
  const dummy = new THREE.Object3D();
  palette.forEach((color, index) => {
    const subset = placements.filter(p => p.color === index);
    const material = new THREE.MeshStandardMaterial({ map: paintTexture(color, index < 2), roughness: .76, metalness: .12 });
    const containers = new THREE.InstancedMesh(containerGeometry, material, subset.length);
    subset.forEach((p, slot) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      containers.setMatrixAt(slot, dummy.matrix);
    });
    containers.instanceMatrix.needsUpdate = true;
    group.add(containers);
  });

  // Accommodation tower with bridge wings, ribbon glazing, individual windows and rooftop equipment.
  box(26, 18, 27, 0, -60, 33.5, cream);
  box(34, 17, 4.8, 0, -59, 48, cream);
  box(34.5, 17.6, .7, 0, -59, 50.7, gray);
  box(35, 1, 2.7, 0, -49.9, 48.3, glass);
  box(1, 15.8, 2.7, -17.1, -59, 48.3, glass);
  box(1, 15.8, 2.7, 17.1, -59, 48.3, glass);
  for (const side of [-1, 1]) {
    for (let floor = 0; floor < 5; floor++) {
      for (let window = 0; window < 6; window++) box(.15, 1.4, 1.45, side * 13.1, -67 + window * 2.5, 27 + floor * 3.8, glass);
    }
    for (let i = 0; i < 13; i++) box(.42, 1.1, 3, -15.5 + i * 2.6, -49.7, 48.3, cream);
    box(2, 12, 1.5, side * 20, -60, 44.2, cream);
    const lifeboat = new THREE.Mesh(new THREE.CapsuleGeometry(2.15, 6, 5, 10), orange);
    lifeboat.position.set(side * 18, -69, 28);
    group.add(lifeboat);
    box(.8, 14, 1, side * 20, -69, 30, cream);
    box(.4, 303, 1, side * 25, -8, 20.7, cream);
  }
  box(8, 8, 7, 0, -63, 53.8, cream);
  box(1, 1, 13, 0, -63, 62.2, gray);
  box(14, .55, .55, 0, -63, 64, cream);
  box(.4, .4, 8, -9, -60, 55, cream);
  box(.4, .4, 7, 9, -60, 55, cream);
  const radome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), cream);
  radome.position.set(6, -60, 53);
  group.add(radome);
  box(12, 13, 12, 0, -135, 45, hull);
  box(13, 14, 2, 0, -135, 51.2, dark);
  for (const x of [-3, 3]) box(2, 5, 5, x, -135, 54, dark);
  // Bow mast, deck fittings, bollards and rail stanchions are actual mesh geometry.
  box(.8, .8, 10, 0, 164, 27, cream);
  box(8, .5, .5, 0, 164, 30, cream);
  for (const x of [-10, 10]) {
    box(2.5, 6, 2, x, 150, 23, dark);
    box(3, 3, 1.4, x, -173, 22, gray);
  }
  const posts = new THREE.InstancedMesh(cube, cream, 104);
  let post = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 52; i++) {
      dummy.position.set(side * 25, -155 + i * 5.8, 22);
      dummy.scale.set(.2, .2, 2.8);
      dummy.updateMatrix();
      posts.setMatrixAt(post++, dummy.matrix);
    }
  }
  group.add(posts);
  for (const side of [-1, 1]) {
    const logo = lettering('ONE', 87, 16);
    const sideRotation = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, side, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(side, 0, 0));
    logo.quaternion.setFromRotationMatrix(sideRotation);
    logo.position.set(side * 25.5, 14, 10.6);
    group.add(logo);
    const shipName = lettering(name.toUpperCase(), 48, 6);
    shipName.quaternion.setFromRotationMatrix(sideRotation);
    shipName.position.set(side * 25.5, -109, 10.5);
    group.add(shipName);
  }
  const wake = new THREE.ShaderMaterial({
    vertexShader: wakeVertex, fragmentShader: wakeFragment, transparent: true,
    depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
  });
  const wakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(440, 1500), wake);
  wakeMesh.position.set(0, -883, .65);
  wakeMesh.renderOrder = 1;
  group.add(wakeMesh);
  const foam = new THREE.MeshBasicMaterial({ color: '#e7faf6', transparent: true, opacity: .6, depthWrite: false });
  for (const side of [-1, 1]) {
    const bowFoam = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 70), foam);
    bowFoam.rotation.z = side * -.27;
    bowFoam.position.set(side * 15, 144, .9);
    group.add(bowFoam);
  }
  return { group, wake };
}

export function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    });
  });
  textures.forEach(texture => texture.dispose());
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
