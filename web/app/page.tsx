import { LifeOsApp } from "../components/life-os-app";
import { createDemoState } from "../lib/domain/demo-data";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <LifeOsApp initialState={createDemoState()} />;
}
