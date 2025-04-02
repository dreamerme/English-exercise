import DictationExercise from "./components/DictationExercise";
import { metadata } from "./metadata";

export default function Home() {
  return (
    <div className="container-center pt-2">
      <DictationExercise />
    </div>
  );
}

export { metadata };
