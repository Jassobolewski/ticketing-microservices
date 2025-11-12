<script>
    const API_BASE = import.meta.env.VITE_API_BASE;

    let email = "";
    let password = "";
    let token = "";
    let title = "";
    let description = "";
    let category = "general";
    let tickets = [];
    let error = "";

    async function login() {
        error = "";
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                error = "Login failed";
                return;
            }

            const data = await res.json();
            token = data.token;
            await loadTickets();
        } catch (e) {
            error = "Network error";
        }
    }

    async function createTicket() {
        if (!token) {
            error = "Login first";
            return;
        }
        error = "";
        const res = await fetch(`${API_BASE}/tickets`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ title, description, category }),
        });
        if (!res.ok) {
            error = "Could not create ticket";
            return;
        }
        title = "";
        description = "";
        await loadTickets();
    }

    async function loadTickets() {
        if (!token) return;
        const res = await fetch(`${API_BASE}/tickets`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            tickets = await res.json();
        }
    }
</script>

<main>
    <h1>Ticketing System Demo</h1>

    <section>
        <h2>Login</h2>
        <input placeholder="Email" bind:value={email} />
        <input placeholder="Password" type="password" bind:value={password} />
        <button on:click={login}>Login</button>
    </section>

    {#if token}
        <section>
            <h2>Create Ticket</h2>
            <input placeholder="Title" bind:value={title} />
            <textarea placeholder="Description" bind:value={description} />
            <select bind:value={category}>
                <option value="general">General</option>
                <option value="bug">Bug</option>
                <option value="incident">Incident</option>
            </select>
            <button on:click={createTicket}>Submit Ticket</button>
        </section>

        <section>
            <h2>Your Tickets</h2>
            {#if tickets.length === 0}
                <p>No tickets yet.</p>
            {:else}
                <ul>
                    {#each tickets as t}
                        <li>
                            <strong>{t.title}</strong> — {t.category} <br />
                            {t.description}
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}

    {#if error}
        <p style="color:red">{error}</p>
    {/if}
</main>
