<script>
    import { onMount } from "svelte";

    // State management
    let token = "";
    let user = null;
    let tickets = [];

    // Auth form state
    let authMode = "login"; // 'login' or 'register'
    let email = "";
    let password = "";
    let authError = "";

    // Ticket form state
    let title = "";
    let description = "";
    let category = "bug";
    let priority = "medium";
    let ticketError = "";
    let ticketSuccess = "";

    const API_URL = "http://localhost:8080";

    // Load token from localStorage on mount
    onMount(() => {
        const savedToken = localStorage.getItem("token");
        if (savedToken) {
            token = savedToken;
            fetchUser();
            fetchTickets();
        }
    });

    // Auth functions
    async function handleAuth() {
        authError = "";
        const endpoint =
            authMode === "login" ? "/auth/login" : "/auth/register";

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                authError = data.error || "Authentication failed";
                return;
            }

            if (authMode === "register") {
                authError = "";
                authMode = "login";
                password = "";
                alert("Registration successful! Please login.");
            } else {
                token = data.token;
                localStorage.setItem("token", token);
                await fetchUser();
                await fetchTickets();
                email = "";
                password = "";
            }
        } catch (err) {
            authError = "Network error: " + err.message;
        }
    }

    async function fetchUser() {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                user = data.user;
            } else {
                logout();
            }
        } catch (err) {
            console.error("Failed to fetch user:", err);
        }
    }

    function logout() {
        token = "";
        user = null;
        tickets = [];
        localStorage.removeItem("token");
    }

    // Ticket functions
    async function createTicket() {
        ticketError = "";
        ticketSuccess = "";

        if (!title || !description) {
            ticketError = "Title and description are required";
            return;
        }

        try {
            const response = await fetch(`${API_URL}/tickets`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ title, description, category, priority }),
            });

            const data = await response.json();

            if (!response.ok) {
                ticketError = data.error || "Failed to create ticket";
                return;
            }

            ticketSuccess = "Ticket created successfully!";
            title = "";
            description = "";
            category = "bug";
            priority = "medium";

            // Refresh ticket list
            await fetchTickets();

            // Clear success message after 3 seconds
            setTimeout(() => {
                ticketSuccess = "";
            }, 3000);
        } catch (err) {
            ticketError = "Network error: " + err.message;
        }
    }

    // Update ticket priority - FIX FOR JSON PARSE ERROR
    async function updateTicketPriority(ticketId, newPriority) {
        try {
            const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ priority: newPriority }),
            });

            // Check if response is ok before parsing
            if (!response.ok) {
                // Try to parse error message
                try {
                    const errorData = await response.json();
                    console.error("Update failed:", errorData.error);
                } catch {
                    console.error("Update failed with status:", response.status);
                }
                return;
            }

            // CRITICAL FIX: Check if response has content before parsing
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const updatedTicket = await response.json();

                // Update the ticket in the local array
                tickets = tickets.map((t) =>
                    t.id === ticketId ? updatedTicket : t
                );
            } else {
                // If no JSON returned, just refresh the list
                await fetchTickets();
            }
        } catch (err) {
            console.error("Error updating priority:", err);
            // Fallback: refresh the list to show updated data
            await fetchTickets();
        }
    }

    async function fetchTickets() {
        try {
            const response = await fetch(`${API_URL}/tickets`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                tickets = data.tickets || [];
            } else {
                console.error("Failed to fetch tickets");
            }
        } catch (err) {
            console.error("Failed to fetch tickets:", err);
        }
    }

    function formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }
</script>

<main>
    <div class="container">
        <h1>🎫 Ticketing System</h1>

        {#if !user}
            <!-- Auth Section -->
            <div class="auth-section">
                <div class="auth-toggle">
                    <button
                        class:active={authMode === "login"}
                        on:click={() => {
                            authMode = "login";
                            authError = "";
                        }}
                    >
                        Login
                    </button>
                    <button
                        class:active={authMode === "register"}
                        on:click={() => {
                            authMode = "register";
                            authError = "";
                        }}
                    >
                        Register
                    </button>
                </div>

                <form on:submit|preventDefault={handleAuth}>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            bind:value={email}
                            placeholder="your@email.com"
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            bind:value={password}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {#if authError}
                        <div class="error">{authError}</div>
                    {/if}

                    <button type="submit" class="btn-primary">
                        {authMode === "login" ? "Login" : "Register"}
                    </button>
                </form>
            </div>
        {:else}
            <!-- Logged In Section -->
            <div class="user-bar">
                <span>👤 {user.email}</span>
                <button on:click={logout} class="btn-secondary">Logout</button>
            </div>

            <!-- Create Ticket Section -->
            <div class="ticket-form">
                <h2>Create New Ticket</h2>

                <form on:submit|preventDefault={createTicket}>
                    <div class="form-group">
                        <label for="title">Title</label>
                        <input
                            id="title"
                            type="text"
                            bind:value={title}
                            placeholder="Brief description of the issue"
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea
                            id="description"
                            bind:value={description}
                            placeholder="Detailed description of the issue"
                            rows="4"
                            required
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label for="category">Category</label>
                        <select id="category" bind:value={category}>
                            <option value="bug">Bug</option>
                            <option value="feature">Feature Request</option>
                            <option value="support">Support</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="priority">Priority</label>
                        <select id="priority" bind:value={priority}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>

                    {#if ticketError}
                        <div class="error">{ticketError}</div>
                    {/if}

                    {#if ticketSuccess}
                        <div class="success">{ticketSuccess}</div>
                    {/if}

                    <button type="submit" class="btn-primary"
                        >Create Ticket</button
                    >
                </form>
            </div>

            <!-- Tickets List -->
            <div class="tickets-list">
                <h2>Your Tickets ({tickets.length})</h2>

                {#if tickets.length === 0}
                    <p class="no-tickets">
                        No tickets yet. Create your first ticket above!
                    </p>
                {:else}
                    <div class="tickets-grid">
                        {#each tickets as ticket (ticket.id)}
                            <div class="ticket-card">
                                <div class="ticket-header">
                                    <h3>{ticket.title}</h3>
                                    <span class="badge badge-{ticket.category}"
                                        >{ticket.category}</span
                                    >
                                </div>
                                <p class="ticket-description">
                                    {ticket.description}
                                </p>
                                <div class="ticket-meta">
                                    <div class="ticket-priority-selector">
                                        <label for="priority-{ticket.id}"
                                            >Priority:</label
                                        >
                                        <select
                                            id="priority-{ticket.id}"
                                            value={ticket.priority}
                                            on:change={(e) =>
                                                updateTicketPriority(
                                                    ticket.id,
                                                    e.target.value,
                                                )}
                                            class="priority-select priority-{ticket.priority}"
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="urgent">Urgent</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="ticket-footer">
                                    <span class="ticket-status"
                                        >Status: {ticket.status}</span
                                    >
                                    <span class="ticket-date"
                                        >{formatDate(ticket.created_at)}</span
                                    >
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</main>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
            Ubuntu, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
    }

    .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
    }

    h1 {
        color: white;
        text-align: center;
        font-size: 2.5rem;
        margin-bottom: 2rem;
    }

    h2 {
        color: #333;
        margin-bottom: 1rem;
    }

    /* Auth Section */
    .auth-section {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        max-width: 400px;
        margin: 0 auto;
    }

    .auth-toggle {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }

    .auth-toggle button {
        flex: 1;
        padding: 0.75rem;
        border: 2px solid #e0e0e0;
        background: white;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
    }

    .auth-toggle button.active {
        background: #667eea;
        color: white;
        border-color: #667eea;
    }

    /* User Bar */
    .user-bar {
        background: white;
        border-radius: 12px;
        padding: 1rem 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .user-bar span {
        font-weight: 600;
        color: #333;
    }

    /* Forms */
    .ticket-form {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: #333;
    }

    input,
    textarea,
    select {
        width: 100%;
        padding: 0.75rem;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.2s;
        box-sizing: border-box;
    }

    input:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: #667eea;
    }

    textarea {
        resize: vertical;
        font-family: inherit;
    }

    /* Buttons */
    button {
        font-size: 1rem;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-primary {
        background: #667eea;
        color: white;
        width: 100%;
    }

    .btn-primary:hover {
        background: #5568d3;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
        background: #e0e0e0;
        color: #333;
    }

    .btn-secondary:hover {
        background: #d0d0d0;
    }

    /* Messages */
    .error {
        background: #fee;
        color: #c33;
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }

    .success {
        background: #efe;
        color: #3c3;
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }

    /* Tickets List */
    .tickets-list {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .no-tickets {
        text-align: center;
        color: #999;
        padding: 2rem;
    }

    .tickets-grid {
        display: grid;
        gap: 1rem;
    }

    .ticket-card {
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        padding: 1.5rem;
        transition: all 0.2s;
    }

    .ticket-card:hover {
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
    }

    .ticket-header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        margin-bottom: 0.75rem;
    }

    .ticket-header h3 {
        margin: 0;
        color: #333;
        font-size: 1.25rem;
    }

    .badge {
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .badge-bug {
        background: #fee;
        color: #c33;
    }
    .badge-feature {
        background: #efe;
        color: #3c3;
    }
    .badge-support {
        background: #eef;
        color: #33c;
    }
    .badge-other {
        background: #f5f5f5;
        color: #666;
    }

    .ticket-description {
        color: #666;
        margin: 0 0 1rem 0;
        line-height: 1.5;
    }

    .ticket-footer {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        color: #999;
    }

    .ticket-status {
        font-weight: 600;
        text-transform: capitalize;
    }

    /* Priority Selector */
    .ticket-meta {
        margin-bottom: 1rem;
    }

    .ticket-priority-selector {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .ticket-priority-selector label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #666;
        margin: 0;
    }

    .priority-select {
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 2px solid;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: capitalize;
    }

    .priority-select:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }

    /* Priority color coding */
    .priority-low {
        background: #e8f5e9;
        border-color: #4caf50;
        color: #2e7d32;
    }

    .priority-medium {
        background: #fff3e0;
        border-color: #ff9800;
        color: #e65100;
    }

    .priority-high {
        background: #ffe0e0;
        border-color: #f44336;
        color: #c62828;
    }

    .priority-urgent {
        background: #f3e5f5;
        border-color: #9c27b0;
        color: #6a1b9a;
        font-weight: 700;
    }

    .priority-low:hover {
        background: #c8e6c9;
    }

    .priority-medium:hover {
        background: #ffe0b2;
    }

    .priority-high:hover {
        background: #ffcdd2;
    }

    .priority-urgent:hover {
        background: #e1bee7;
    }
</style>
