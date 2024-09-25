import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";

function App() {
  return (
    <>
      <Loader />
      <Leva  hidden/>
      <UI />
      <Canvas shadows camera={{ position: [0, 0, 8], fov: 42 }}>
        <Experience />
      </Canvas>
    </>
  );
}

export default App;
