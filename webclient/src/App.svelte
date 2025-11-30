<script>
    import { onMount } from "svelte";

    // State management
    let token = "";
    let user = null;
    let tickets = [];
    let selectedTicket = null;
    let ticketHistory = [];

    // Auth form state
    let authMode = "login";
    let email = "";
    let password = "";
    let role = "user";
    let authError = "";

    // Ticket form state
    let title = "";
    let description = "";
    let category = "bug";
    let priority = "medium";
    let ticketError = "";
    let ticketSuccess = "";

    // Workflow state
    let showWorkflowModal = false;
    let workflowError = "";

    const API_URL = "http://localhost:8080";

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
                body: JSON.stringify({
                    email,
                    password,
                    ...(authMode === "register" ? { role } : {}),
                }),
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
        selectedTicket = null;
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

            await fetchTickets();
            setTimeout(() => {
                ticketSuccess = "";
            }, 3000);
        } catch (err) {
            ticketError = "Network error: " + err.message;
        }
    }

    // REMOVED: Duplicate function - using workflow version below instead

    async function fetchTickets() {
        try {
            const response = await fetch(`${API_URL}/tickets`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                tickets = data.tickets || [];
            }
        } catch (err) {
            console.error("Failed to fetch tickets:", err);
        }
    }

    async function viewTicketDetails(ticket) {
        selectedTicket = ticket;
        showWorkflowModal = true;
        await fetchTicketHistory(ticket.id);
    }

    async function fetchTicketHistory(ticketId) {
        try {
            const response = await fetch(
                `${API_URL}/workflow/history/${ticketId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );

            if (response.ok) {
                const data = await response.json();
                ticketHistory = data.history || [];
            }
        } catch (err) {
            console.error("Failed to fetch history:", err);
        }
    }

    async function updateTicketPriority(ticketId, newPriority) {
        workflowError = "";
        try {
            const response = await fetch(
                `${API_URL}/workflow/priority/${ticketId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ priority: newPriority }),
                },
            );

            // FIX: Check if response is ok before parsing
            if (!response.ok) {
                // Try to parse error message if JSON available
                try {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errorData = await response.json();
                        workflowError = errorData.error || "Failed to update priority";
                    } else {
                        workflowError = `Failed to update priority (${response.status})`;
                    }
                } catch {
                    workflowError = `Failed to update priority (${response.status})`;
                }
                return;
            }

            // FIX: Check if response has JSON content before parsing
            const contentType = response.headers.get("content-type");
            let data = null;

            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            }

            await fetchTickets();
            if (selectedTicket && selectedTicket.id === ticketId) {
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            console.error("Error updating priority:", err);
            workflowError = "Network error: " + err.message;
            // Fallback: refresh tickets to show any updates
            await fetchTickets();
        }
    }

    async function updateTicketStatus(ticketId, newStatus) {
        workflowError = "";
        try {
            const response = await fetch(
                `${API_URL}/workflow/status/${ticketId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ status: newStatus }),
                },
            );

            // FIX: Check if response is ok before parsing
            if (!response.ok) {
                try {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errorData = await response.json();
                        workflowError = errorData.error || "Failed to update status";
                    } else {
                        workflowError = `Failed to update status (${response.status})`;
                    }
                } catch {
                    workflowError = `Failed to update status (${response.status})`;
                }
                return;
            }

            // FIX: Check if response has JSON content before parsing
            const contentType = response.headers.get("content-type");
            let data = null;

            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            }

            await fetchTickets();
            if (selectedTicket && selectedTicket.id === ticketId) {
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            console.error("Error updating status:", err);
            workflowError = "Network error: " + err.message;
            await fetchTickets();
        }
    }

    async function assignTicket(ticketId, assignedTo) {
        workflowError = "";
        try {
            const response = await fetch(
                `${API_URL}/workflow/assign/${ticketId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ assigned_to: assignedTo || null }),
                },
            );

            // FIX: Check if response is ok before parsing
            if (!response.ok) {
                try {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const errorData = await response.json();
                        workflowError = errorData.error || "Failed to assign ticket";
                    } else {
                        workflowError = `Failed to assign ticket (${response.status})`;
                    }
                } catch {
                    workflowError = `Failed to assign ticket (${response.status})`;
                }
                return;
            }

            // FIX: Check if response has JSON content before parsing
            const contentType = response.headers.get("content-type");
            let data = null;

            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            }

            await fetchTickets();
            if (selectedTicket && selectedTicket.id === ticketId) {
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            console.error("Error assigning ticket:", err);
            workflowError = "Network error: " + err.message;
            await fetchTickets();
        }
    }

    function closeModal() {
        showWorkflowModal = false;
        selectedTicket = null;
        ticketHistory = [];
        workflowError = "";
    }

    function formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    function isStaff() {
        return user && (user.role === "staff" || user.role === "admin");
    }

    function getPriorityColor(priority) {
        const colors = {
            urgent: "#dc2626",
            high: "#ea580c",
            medium: "#ca8a04",
            low: "#65a30d",
        };
        return colors[priority] || "#6b7280";
    }

    function getStatusColor(status) {
        const colors = {
            new: "#6b7280",
            assigned: "#3b82f6",
            in_progress: "#f59e0b",
            resolved: "#10b981",
        };
        return colors[status] || "#6b7280";
    }
</script>

<main>
    <div class="container">
        <h1>🎫 Ticketing System with Workflow</h1>

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

                    {#if authMode === "register"}
                        <div class="form-group">
                            <label for="role">Role</label>
                            <select id="role" bind:value={role}>
                                <option value="user">User</option>
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    {/if}

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
                <span
                    >👤 {user.email}
                    {#if isStaff()}<span class="role-badge">{user.role}</span
                        >{/if}</span
                >
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
                        <label for="category"
                            >Category (priority auto-assigned)</label
                        >
                        <select id="category" bind:value={category}>
                            <option value="bug">Bug (High Priority)</option>
                            <option value="feature"
                                >Feature Request (Medium Priority)</option
                            >
                            <option value="support"
                                >Support (Medium Priority)</option
                            >
                            <option value="other">Other (Low Priority)</option>
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
                <h2>
                    {isStaff() ? "All Tickets" : "Your Tickets"} ({tickets.length})
                </h2>

                {#if tickets.length === 0}
                    <p class="no-tickets">No tickets yet.</p>
                {:else}
                    <div class="tickets-grid">
                        {#each tickets as ticket (ticket.id)}
                            <div
                                class="ticket-card"
                                on:click={() => viewTicketDetails(ticket)}
                            >
                                <div class="ticket-header">
                                    <h3>{ticket.title}</h3>
                                    <div class="badges">
                                        <span class="badge badge-category"
                                            >{ticket.category}</span
                                        >
                                        <span
                                            class="badge badge-priority"
                                            style="background-color: {getPriorityColor(
                                                ticket.priority,
                                            )}20; color: {getPriorityColor(
                                                ticket.priority,
                                            )}"
                                        >
                                            {ticket.priority}
                                        </span>
                                    </div>
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
                                    <span
                                        class="ticket-status"
                                        style="color: {getStatusColor(
                                            ticket.status,
                                        )}"
                                    >
                                        ● {ticket.status}
                                    </span>
                                    <span class="ticket-meta">
                                        {#if ticket.assigned_to}
                                            👤 Assigned to #{ticket.assigned_to}
                                        {:else}
                                            Unassigned
                                        {/if}
                                    </span>
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

    <!-- Workflow Modal -->
    {#if showWorkflowModal && selectedTicket}
        <div class="modal-overlay" on:click={closeModal}>
            <div class="modal" on:click|stopPropagation>
                <div class="modal-header">
                    <h2>Ticket #{selectedTicket.id}: {selectedTicket.title}</h2>
                    <button class="close-btn" on:click={closeModal}>✕</button>
                </div>

                <div class="modal-body">
                    <div class="ticket-details">
                        <div class="detail-row">
                            <strong>Description:</strong>
                            <p>{selectedTicket.description}</p>
                        </div>

                        <div class="detail-row">
                            <strong>Category:</strong>
                            <span class="badge badge-category"
                                >{selectedTicket.category}</span
                            >
                        </div>

                        <div class="detail-row">
                            <strong>Status:</strong>
                            <span
                                style="color: {getStatusColor(
                                    selectedTicket.status,
                                )}"
                            >
                                ● {selectedTicket.status}
                            </span>
                        </div>

                        <div class="detail-row">
                            <strong>Priority:</strong>
                            <span
                                style="color: {getPriorityColor(
                                    selectedTicket.priority,
                                )}"
                            >
                                {selectedTicket.priority}
                            </span>
                        </div>

                        <div class="detail-row">
                            <strong>Assigned To:</strong>
                            <span
                                >{selectedTicket.assigned_to
                                    ? `User #${selectedTicket.assigned_to}`
                                    : "Unassigned"}</span
                            >
                        </div>

                        <div class="detail-row">
                            <strong>Created:</strong>
                            <span>{formatDate(selectedTicket.created_at)}</span>
                        </div>
                    </div>

                    {#if isStaff()}
                        <div class="workflow-controls">
                            <h3>Workflow Actions</h3>

                            {#if workflowError}
                                <div class="error">{workflowError}</div>
                            {/if}

                            <div class="control-group">
                                <label>Change Priority:</label>
                                <div class="button-group">
                                    <button
                                        on:click={() =>
                                            updateTicketPriority(
                                                selectedTicket.id,
                                                "low",
                                            )}>Low</button
                                    >
                                    <button
                                        on:click={() =>
                                            updateTicketPriority(
                                                selectedTicket.id,
                                                "medium",
                                            )}>Medium</button
                                    >
                                    <button
                                        on:click={() =>
                                            updateTicketPriority(
                                                selectedTicket.id,
                                                "high",
                                            )}>High</button
                                    >
                                    <button
                                        on:click={() =>
                                            updateTicketPriority(
                                                selectedTicket.id,
                                                "urgent",
                                            )}>Urgent</button
                                    >
                                </div>
                            </div>

                            <div class="control-group">
                                <label>Change Status:</label>
                                <div class="button-group">
                                    {#if selectedTicket.status === "new"}
                                        <button
                                            on:click={() =>
                                                updateTicketStatus(
                                                    selectedTicket.id,
                                                    "assigned",
                                                )}>→ Assigned</button
                                        >
                                    {:else if selectedTicket.status === "assigned"}
                                        <button
                                            on:click={() =>
                                                updateTicketStatus(
                                                    selectedTicket.id,
                                                    "in_progress",
                                                )}>→ In Progress</button
                                        >
                                    {:else if selectedTicket.status === "in_progress"}
                                        <button
                                            on:click={() =>
                                                updateTicketStatus(
                                                    selectedTicket.id,
                                                    "resolved",
                                                )}>→ Resolved</button
                                        >
                                    {:else}
                                        <span class="info"
                                            >Ticket is resolved</span
                                        >
                                    {/if}
                                </div>
                            </div>

                            <div class="control-group">
                                <label>Assign Ticket:</label>
                                <div class="button-group">
                                    <button
                                        on:click={() =>
                                            assignTicket(
                                                selectedTicket.id,
                                                user.sub,
                                            )}
                                        >Assign to Me (#{user.sub})</button
                                    >
                                    <button
                                        on:click={() =>
                                            assignTicket(
                                                selectedTicket.id,
                                                null,
                                            )}>Unassign</button
                                    >
                                </div>
                            </div>
                        </div>
                    {/if}

                    <div class="ticket-history">
                        <h3>Change History</h3>
                        {#if ticketHistory.length === 0}
                            <p class="no-history">No changes yet</p>
                        {:else}
                            <div class="history-list">
                                {#each ticketHistory as change (change.id)}
                                    <div class="history-item">
                                        <strong>{change.field_name}</strong>
                                        changed from
                                        <code>{change.old_value || "null"}</code
                                        >
                                        to <code>{change.new_value}</code>
                                        <br />
                                        <small
                                            >by User #{change.changed_by} • {formatDate(
                                                change.changed_at,
                                            )}</small
                                        >
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</main>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
    }

    .container {
        max-width: 1200px;
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

    h3 {
        color: #555;
        margin-top: 1.5rem;
        margin-bottom: 1rem;
    }

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

    .role-badge {
        background: #667eea;
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        margin-left: 0.5rem;
        text-transform: uppercase;
    }

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
        cursor: pointer;
    }

    .ticket-card:hover {
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
        transform: translateY(-2px);
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

    .badges {
        display: flex;
        gap: 0.5rem;
    }

    .badge {
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .badge-category {
        background: #f3f4f6;
        color: #6b7280;
    }

    .badge-priority {
        font-weight: 700;
    }

    .ticket-description {
        color: #666;
        margin: 0 0 1rem 0;
        line-height: 1.5;
    }

    .ticket-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.875rem;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .ticket-status {
        font-weight: 700;
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
