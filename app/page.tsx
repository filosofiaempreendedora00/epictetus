import Header from "@/components/Header";
import Board from "@/components/Board";
import Sidebar from "@/components/Sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Header />
        <Board />
      </main>
    </div>
  );
}
