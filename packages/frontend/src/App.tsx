import { useState } from "react";
import { client } from "./api";

export default function App() {
  const [newName, setNewName] = useState("");

  const { data, refetch } = client.getItems.useQuery(["items"], {});

  const createMutation = client.createItem.useMutation({
    onSuccess: () => {
      setNewName("");
      refetch();
    },
  });

  const deleteMutation = client.deleteItem.useMutation({
    onSuccess: () => refetch(),
  });

  const items = data?.status === 200 ? data.body.items : [];

  return (
    <div className="app">
      <header className="header">
        <h1>My App</h1>
        <span className="version">{__APP_VERSION__}</span>
      </header>

      <main className="main">
        <section className="create-section">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                createMutation.mutate({ body: { name: newName.trim() } });
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (newName.trim()) {
                createMutation.mutate({ body: { name: newName.trim() } });
              }
            }}
            disabled={!newName.trim() || createMutation.isPending}
          >
            Add
          </button>
        </section>

        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id} className="item">
              <span className="item-name">{item.name}</span>
              <span className="item-date">{new Date(item.createdAt).toLocaleString()}</span>
              <button
                type="button"
                className="delete-btn"
                onClick={() => deleteMutation.mutate({ params: { id: item.id }, body: {} })}
              >
                ✕
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="empty">No items yet. Add one above.</li>}
        </ul>
      </main>
    </div>
  );
}
