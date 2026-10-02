import * as THREE from 'three';

/** Local animated surface over satellite water, softly blended at the horizon. */
export function createOcean() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOffset: { value: new THREE.Vector2() }, uOpacity: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform vec2 uOffset;
      varying vec2 vWorld; varying vec2 vUv;
      void main(){
        vUv=uv;vWorld=position.xy+uOffset;
        vec3 p=position;
        p.z+=sin(vWorld.x*.035+vWorld.y*.027-uTime*1.15)*.48;
        p.z+=sin(vWorld.x*.063-vWorld.y*.041+uTime*.8)*.24;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uTime; uniform float uOpacity;
      varying vec2 vWorld; varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float waves(vec2 p){
        float n=sin(p.x*.13+p.y*.24+uTime*1.35)*.34;
        n+=sin(p.x*.37-p.y*.11-uTime*.9)*.23;
        n+=sin(p.x*.82+p.y*.47+uTime*1.7)*.12;
        n+=noise(p*.37+uTime*.14)*.28;
        return n;
      }
      void main(){
        vec2 p=vWorld*.65;
        float h=waves(p),hx=waves(p+vec2(.7,0.)),hy=waves(p+vec2(0.,.7));
        vec3 normal=normalize(vec3((h-hx)*1.05,(h-hy)*1.05,1.));
        vec3 sun=normalize(vec3(-.35,.55,.85));
        float glint=pow(max(dot(reflect(-sun,normal),normalize(vec3(.25,-.6,.8))),0.),85.);
        float broad=noise(p*.0008)*.32+noise(p*.004)*.17;
        vec3 deep=vec3(.025,.15,.195),shallow=vec3(.09,.32,.365);
        vec3 color=mix(deep,shallow,.25+broad+h*.12);
        color+=vec3(.7,.85,.87)*glint*.18;
        color+=pow(max(h,0.),7.)*vec3(.1,.21,.22);
        float edge=1.-smoothstep(.32,.5,length(vUv-.5));
        gl_FragColor=vec4(color,edge*uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 80, 80), material);
  mesh.position.z = -.25;
  mesh.renderOrder = -1;
  return { mesh, material };
}
