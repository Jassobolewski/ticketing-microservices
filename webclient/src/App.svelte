<script>
    import { onMount } from "svelte";

    // State management
    let token = "";
    let user = null;
    let tickets = [];
    let selectedTicket = null;
    let ticketHistory = [];
    let notifications = [];
    let analytics = null;
    let ticketFiles = [];
    let ticketFeedback = null;

    // UI State
    let activeTab = "tickets";
    let showTicketModal = false;
    let showFileUpload = false;
    let uploadError = "";

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

    // Feedback state
    let feedbackRating = 5;
    let feedbackComment = "";
    let feedbackError = "";

    // Workflow state
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
        const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";

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

                // Fetch additional data after login
                if (isStaff()) {
                    fetchAnalytics();
                }
                fetchNotifications();
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
        notifications = [];
        analytics = null;
        localStorage.removeItem("token");
        activeTab = "tickets";
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
            setTimeout(() => (ticketSuccess = ""), 3000);
        } catch (err) {
            ticketError = "Network error: " + err.message;
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
            }
        } catch (err) {
            console.error("Failed to fetch tickets:", err);
        }
    }

    async function viewTicketDetails(ticket) {
        selectedTicket = ticket;
        showTicketModal = true;
        await fetchTicketHistory(ticket.id);
        await fetchTicketFiles(ticket.id);
        await fetchTicketFeedback(ticket.id);
    }

    async function fetchTicketHistory(ticketId) {
        try {
            const response = await fetch(`${API_URL}/workflow/history/${ticketId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                ticketHistory = data.history || [];
            }
        } catch (err) {
            console.error("Failed to fetch history:", err);
        }
    }

    // Media (S5) functions
    async function fetchTicketFiles(ticketId) {
        try {
            const response = await fetch(`${API_URL}/media/ticket/${ticketId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                ticketFiles = data.files || [];
            }
        } catch (err) {
            console.error("Failed to fetch files:", err);
            ticketFiles = [];
        }
    }

    async function uploadFile(event) {
        uploadError = "";
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("ticket_id", selectedTicket.id);

        try {
            const response = await fetch(`${API_URL}/media/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (response.ok) {
                await fetchTicketFiles(selectedTicket.id);
                showFileUpload = false;
                event.target.value = "";
            } else {
                const data = await response.json();
                uploadError = data.error || "Failed to upload file";
            }
        } catch (err) {
            uploadError = "Network error: " + err.message;
        }
    }

    async function downloadFile(fileId, filename) {
        window.open(`${API_URL}/media/${fileId}`, "_blank");
    }

    // Feedback (S8) functions
    async function fetchTicketFeedback(ticketId) {
        try {
            const response = await fetch(`${API_URL}/feedback/ticket/${ticketId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                ticketFeedback = data;
            }
        } catch (err) {
            console.error("Failed to fetch feedback:", err);
            ticketFeedback = null;
        }
    }

    async function submitFeedback() {
        feedbackError = "";
        try {
            const response = await fetch(`${API_URL}/feedback/feedback`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ticket_id: selectedTicket.id,
                    rating: feedbackRating,
                    comment: feedbackComment,
                }),
            });

            if (response.ok) {
                await fetchTicketFeedback(selectedTicket.id);
                feedbackComment = "";
                feedbackRating = 5;
            } else {
                const data = await response.json();
                feedbackError = data.error || "Failed to submit feedback";
            }
        } catch (err) {
            feedbackError = "Network error: " + err.message;
        }
    }

    // Notifications (S6) functions
    async function fetchNotifications() {
        if (!user) return;

        try {
            const response = await fetch(`${API_URL}/notifications/history/${user.sub}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                notifications = data.notifications || [];
            }
        } catch (err) {
            console.error("Failed to fetch notifications:", err);
        }
    }

    // Analytics (S7) functions
    async function fetchAnalytics() {
        if (!isStaff()) return;

        try {
            const response = await fetch(`${API_URL}/analytics/dashboard`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                analytics = data;
            }
        } catch (err) {
            console.error("Failed to fetch analytics:", err);
        }
    }

    // Workflow functions
    async function updateTicketPriority(ticketId, newPriority) {
        workflowError = "";
        try {
            const response = await fetch(`${API_URL}/workflow/priority/${ticketId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ priority: newPriority }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                workflowError = data.error || "Failed to update priority";
                return;
            }

            await fetchTickets();
            if (selectedTicket?.id === ticketId) {
                const data = await response.json().catch(() => null);
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            workflowError = "Network error: " + err.message;
            await fetchTickets();
        }
    }

    async function updateTicketStatus(ticketId, newStatus) {
        workflowError = "";
        try {
            const response = await fetch(`${API_URL}/workflow/status/${ticketId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                workflowError = data.error || "Failed to update status";
                return;
            }

            await fetchTickets();
            if (selectedTicket?.id === ticketId) {
                const data = await response.json().catch(() => null);
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            workflowError = "Network error: " + err.message;
            await fetchTickets();
        }
    }

    async function assignTicket(ticketId, assignedTo) {
        workflowError = "";
        try {
            const response = await fetch(`${API_URL}/workflow/assign/${ticketId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ assigned_to: assignedTo || null }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                workflowError = data.error || "Failed to assign ticket";
                return;
            }

            await fetchTickets();
            if (selectedTicket?.id === ticketId) {
                const data = await response.json().catch(() => null);
                selectedTicket = data || selectedTicket;
                await fetchTicketHistory(ticketId);
            }
        } catch (err) {
            workflowError = "Network error: " + err.message;
            await fetchTickets();
        }
    }

    function closeModal() {
        showTicketModal = false;
        selectedTicket = null;
        ticketHistory = [];
        ticketFiles = [];
        ticketFeedback = null;
        workflowError = "";
        feedbackError = "";
        showFileUpload = false;
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

    function changeTab(tab) {
        activeTab = tab;
        if (tab === "analytics" && isStaff()) {
            fetchAnalytics();
        } else if (tab === "notifications") {
            fetchNotifications();
        }
    }
</script>

<main>
    <div class="container">
        <h1>🎫 Microservices Ticketing System</h1>

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
                <span>
                    👤 {user.email}
                    {#if isStaff()}
                        <span class="role-badge">{user.role}</span>
                    {/if}
                </span>
                <button on:click={logout} class="btn-secondary">Logout</button>
            </div>

            <!-- Tab Navigation -->
            <div class="tabs">
                <button
                    class:active={activeTab === "tickets"}
                    on:click={() => changeTab("tickets")}
                >
                    🎫 Tickets
                </button>
                {#if isStaff()}
                    <button
                        class:active={activeTab === "analytics"}
                        on:click={() => changeTab("analytics")}
                    >
                        📊 Analytics
                    </button>
                {/if}
                <button
                    class:active={activeTab === "notifications"}
                    on:click={() => changeTab("notifications")}
                >
                    🔔 Notifications
                    {#if notifications.length > 0}
                        <span class="badge">{notifications.length}</span>
                    {/if}
                </button>
            </div>

            <!-- Tab Content -->
            {#if activeTab === "tickets"}
                <!-- Create Ticket Section -->
                <div class="ticket-form">
                    <h2>Create New Ticket</h2>

                    <form on:submit|preventDefault={createTicket}>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="title">Title</label>
                                <input
                                    id="title"
                                    type="text"
                                    bind:value={title}
                                    placeholder="Brief description"
                                    required
                                />
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
                        </div>

                        <div class="form-group">
                            <label for="description">Description</label>
                            <textarea
                                id="description"
                                bind:value={description}
                                placeholder="Detailed description"
                                rows="3"
                                required
                            ></textarea>
                        </div>

                        {#if ticketError}
                            <div class="error">{ticketError}</div>
                        {/if}

                        {#if ticketSuccess}
                            <div class="success">{ticketSuccess}</div>
                        {/if}

                        <button type="submit" class="btn-primary">Create Ticket</button>
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
                                <div class="ticket-card" on:click={() => viewTicketDetails(ticket)}>
                                    <div class="ticket-header">
                                        <h3>#{ticket.id} {ticket.title}</h3>
                                        <div class="badges">
                                            <span
                                                class="badge-priority"
                                                style="background-color: {getPriorityColor(ticket.priority)}20; color: {getPriorityColor(ticket.priority)}"
                                            >
                                                {ticket.priority}
                                            </span>
                                        </div>
                                    </div>
                                    <p class="ticket-description">{ticket.description}</p>
                                    <div class="ticket-footer">
                                        <span class="badge-category">{ticket.category}</span>
                                        <span
                                            class="ticket-status"
                                            style="color: {getStatusColor(ticket.status)}"
                                        >
                                            ● {ticket.status}
                                        </span>
                                        <span class="ticket-date">{formatDate(ticket.created_at)}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "analytics" && isStaff()}
                <div class="analytics-dashboard">
                    <h2>📊 Analytics Dashboard</h2>

                    {#if analytics}
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">{analytics.metrics.tickets.total}</div>
                                <div class="stat-label">Total Tickets</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">{analytics.active_users}</div>
                                <div class="stat-label">Active Users (30d)</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">
                                    {analytics.metrics.feedback.average_rating || "N/A"}
                                </div>
                                <div class="stat-label">Avg Rating</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">{analytics.metrics.feedback.total}</div>
                                <div class="stat-label">Total Feedback</div>
                            </div>
                        </div>

                        <div class="charts-grid">
                            <div class="chart-card">
                                <h3>Tickets by Status</h3>
                                {#each analytics.metrics.tickets.by_status as status}
                                    <div class="bar-item">
                                        <span class="bar-label">{status.status}</span>
                                        <div class="bar-container">
                                            <div
                                                class="bar"
                                                style="width: {(status.count / analytics.metrics.tickets.total) * 100}%; background-color: {getStatusColor(status.status)}"
                                            ></div>
                                        </div>
                                        <span class="bar-value">{status.count}</span>
                                    </div>
                                {/each}
                            </div>

                            <div class="chart-card">
                                <h3>Tickets by Priority</h3>
                                {#each analytics.metrics.tickets.by_priority as priority}
                                    <div class="bar-item">
                                        <span class="bar-label">{priority.priority}</span>
                                        <div class="bar-container">
                                            <div
                                                class="bar"
                                                style="width: {(priority.count / analytics.metrics.tickets.total) * 100}%; background-color: {getPriorityColor(priority.priority)}"
                                            ></div>
                                        </div>
                                        <span class="bar-value">{priority.count}</span>
                                    </div>
                                {/each}
                            </div>

                            <div class="chart-card">
                                <h3>Tickets by Category</h3>
                                {#each analytics.metrics.tickets.by_category as cat}
                                    <div class="bar-item">
                                        <span class="bar-label">{cat.category}</span>
                                        <div class="bar-container">
                                            <div
                                                class="bar"
                                                style="width: {(cat.count / analytics.metrics.tickets.total) * 100}%"
                                            ></div>
                                        </div>
                                        <span class="bar-value">{cat.count}</span>
                                    </div>
                                {/each}
                            </div>

                            <div class="chart-card">
                                <h3>Recent Activity (7 days)</h3>
                                {#each analytics.metrics.tickets.recent_trend as trend}
                                    <div class="bar-item">
                                        <span class="bar-label">{trend.date}</span>
                                        <div class="bar-container">
                                            <div class="bar" style="width: {trend.count * 20}%"></div>
                                        </div>
                                        <span class="bar-value">{trend.count}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="recent-tickets">
                            <h3>Recent Tickets</h3>
                            <div class="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Title</th>
                                            <th>Status</th>
                                            <th>Priority</th>
                                            <th>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each analytics.recent_tickets as ticket}
                                            <tr on:click={() => viewTicketDetails(ticket)}>
                                                <td>#{ticket.id}</td>
                                                <td>{ticket.title}</td>
                                                <td>
                                                    <span style="color: {getStatusColor(ticket.status)}">
                                                        {ticket.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style="color: {getPriorityColor(ticket.priority)}">
                                                        {ticket.priority}
                                                    </span>
                                                </td>
                                                <td>{formatDate(ticket.created_at)}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    {:else}
                        <p class="loading">Loading analytics...</p>
                    {/if}
                </div>
            {:else if activeTab === "notifications"}
                <div class="notifications-panel">
                    <h2>🔔 Notification History</h2>

                    {#if notifications.length === 0}
                        <p class="no-data">No notifications yet.</p>
                    {:else}
                        <div class="notifications-list">
                            {#each notifications as notification}
                                <div class="notification-card">
                                    <div class="notification-header">
                                        <span class="notification-type">{notification.type.replace(/_/g, " ")}</span>
                                        <span class="notification-channel">{notification.channel}</span>
                                        <span class="notification-status status-{notification.status}">
                                            {notification.status}
                                        </span>
                                    </div>
                                    <p class="notification-message">{notification.message}</p>
                                    <div class="notification-footer">
                                        {#if notification.ticket_id}
                                            <span>Ticket #{notification.ticket_id}</span>
                                        {/if}
                                        <span>{formatDate(notification.created_at)}</span>
                                        {#if notification.sent_at}
                                            <span>Sent: {formatDate(notification.sent_at)}</span>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>

    <!-- Ticket Details Modal -->
    {#if showTicketModal && selectedTicket}
        <div class="modal-overlay" on:click={closeModal}>
            <div class="modal" on:click|stopPropagation>
                <div class="modal-header">
                    <h2>Ticket #{selectedTicket.id}: {selectedTicket.title}</h2>
                    <button class="close-btn" on:click={closeModal}>✕</button>
                </div>

                <div class="modal-body">
                    <!-- Ticket Details -->
                    <div class="ticket-details">
                        <div class="detail-row">
                            <strong>Description:</strong>
                            <p>{selectedTicket.description}</p>
                        </div>

                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Category</strong>
                                <span>{selectedTicket.category}</span>
                            </div>
                            <div class="detail-item">
                                <strong>Status</strong>
                                <span style="color: {getStatusColor(selectedTicket.status)}">
                                    {selectedTicket.status}
                                </span>
                            </div>
                            <div class="detail-item">
                                <strong>Priority</strong>
                                <span style="color: {getPriorityColor(selectedTicket.priority)}">
                                    {selectedTicket.priority}
                                </span>
                            </div>
                            <div class="detail-item">
                                <strong>Created</strong>
                                <span>{formatDate(selectedTicket.created_at)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- File Attachments (S5 Media) -->
                    <div class="section">
                        <div class="section-header">
                            <h3>📎 Attachments</h3>
                            <button class="btn-small" on:click={() => (showFileUpload = !showFileUpload)}>
                                {showFileUpload ? "Cancel" : "+ Upload"}
                            </button>
                        </div>

                        {#if showFileUpload}
                            <div class="upload-area">
                                <input
                                    type="file"
                                    on:change={uploadFile}
                                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                />
                                {#if uploadError}
                                    <div class="error">{uploadError}</div>
                                {/if}
                            </div>
                        {/if}

                        {#if ticketFiles.length > 0}
                            <div class="files-list">
                                {#each ticketFiles as file}
                                    <div class="file-item" on:click={() => downloadFile(file.id, file.original_filename)}>
                                        <span class="file-icon">📄</span>
                                        <div class="file-info">
                                            <div class="file-name">{file.original_filename}</div>
                                            <div class="file-meta">
                                                {(file.file_size / 1024).toFixed(1)} KB • {formatDate(file.uploaded_at)}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="no-data">No attachments</p>
                        {/if}
                    </div>

                    <!-- Feedback (S8) -->
                    <div class="section">
                        <h3>⭐ Feedback</h3>

                        {#if ticketFeedback && ticketFeedback.feedback.length > 0}
                            <div class="feedback-summary">
                                <div class="rating-display">
                                    Average Rating: <strong>{ticketFeedback.average_rating}/5</strong>
                                    ({ticketFeedback.total_feedback} reviews)
                                </div>
                            </div>

                            <div class="feedback-list">
                                {#each ticketFeedback.feedback as fb}
                                    <div class="feedback-item">
                                        <div class="feedback-rating">{"⭐".repeat(fb.rating)}</div>
                                        {#if fb.comment}
                                            <p>{fb.comment}</p>
                                        {/if}
                                        <small>User #{fb.user_id} • {formatDate(fb.created_at)}</small>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <div class="feedback-form">
                            <h4>Submit Your Feedback</h4>
                            <div class="rating-selector">
                                {#each [1, 2, 3, 4, 5] as star}
                                    <button
                                        class="star-btn"
                                        class:selected={feedbackRating >= star}
                                        on:click={() => (feedbackRating = star)}
                                    >
                                        ⭐
                                    </button>
                                {/each}
                            </div>
                            <textarea
                                bind:value={feedbackComment}
                                placeholder="Optional comment..."
                                rows="3"
                            ></textarea>
                            {#if feedbackError}
                                <div class="error">{feedbackError}</div>
                            {/if}
                            <button class="btn-primary" on:click={submitFeedback}>Submit Feedback</button>
                        </div>
                    </div>

                    <!-- Workflow Actions (S4) -->
                    {#if isStaff()}
                        <div class="section">
                            <h3>⚙️ Workflow Actions</h3>

                            {#if workflowError}
                                <div class="error">{workflowError}</div>
                            {/if}

                            <div class="workflow-grid">
                                <div class="control-group">
                                    <label>Priority:</label>
                                    <div class="button-group">
                                        {#each ["low", "medium", "high", "urgent"] as p}
                                            <button
                                                class="btn-workflow"
                                                class:active={selectedTicket.priority === p}
                                                on:click={() => updateTicketPriority(selectedTicket.id, p)}
                                            >
                                                {p}
                                            </button>
                                        {/each}
                                    </div>
                                </div>

                                <div class="control-group">
                                    <label>Status:</label>
                                    <div class="button-group">
                                        {#if selectedTicket.status === "new"}
                                            <button
                                                class="btn-workflow"
                                                on:click={() => updateTicketStatus(selectedTicket.id, "assigned")}
                                            >
                                                → Assigned
                                            </button>
                                        {:else if selectedTicket.status === "assigned"}
                                            <button
                                                class="btn-workflow"
                                                on:click={() => updateTicketStatus(selectedTicket.id, "in_progress")}
                                            >
                                                → In Progress
                                            </button>
                                        {:else if selectedTicket.status === "in_progress"}
                                            <button
                                                class="btn-workflow"
                                                on:click={() => updateTicketStatus(selectedTicket.id, "resolved")}
                                            >
                                                → Resolved
                                            </button>
                                        {:else}
                                            <span>Ticket is resolved</span>
                                        {/if}
                                    </div>
                                </div>

                                <div class="control-group">
                                    <label>Assignment:</label>
                                    <div class="button-group">
                                        <button
                                            class="btn-workflow"
                                            on:click={() => assignTicket(selectedTicket.id, user.sub)}
                                        >
                                            Assign to Me
                                        </button>
                                        <button
                                            class="btn-workflow"
                                            on:click={() => assignTicket(selectedTicket.id, null)}
                                        >
                                            Unassign
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Change History -->
                    <div class="section">
                        <h3>📋 Change History</h3>
                        {#if ticketHistory.length === 0}
                            <p class="no-data">No changes yet</p>
                        {:else}
                            <div class="history-list">
                                {#each ticketHistory as change}
                                    <div class="history-item">
                                        <strong>{change.field_name}</strong>
                                        changed from <code>{change.old_value || "null"}</code>
                                        to <code>{change.new_value}</code>
                                        <br />
                                        <small>by User #{change.changed_by} • {formatDate(change.changed_at)}</small>
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
    }

    .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem;
    }

    h1 {
        color: white;
        text-align: center;
        font-size: 2.5rem;
        margin-bottom: 2rem;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    h2 {
        color: #333;
        margin-bottom: 1.5rem;
    }

    h3 {
        color: #555;
        margin-top: 0;
        margin-bottom: 1rem;
    }

    /* Auth Section */
    .auth-section {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
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
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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

    /* Tabs */
    .tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }

    .tabs button {
        background: rgba(255, 255, 255, 0.9);
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .tabs button.active {
        background: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateY(-2px);
    }

    .tabs button .badge {
        background: #dc2626;
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
    }

    /* Forms */
    .ticket-form,
    .analytics-dashboard,
    .notifications-panel,
    .tickets-list {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .form-group {
        margin-bottom: 1rem;
    }

    .form-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
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
        font-family: inherit;
    }

    input:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: #667eea;
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
    }

    .btn-secondary {
        background: #e0e0e0;
        color: #333;
    }

    .btn-small {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
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

    /* Tickets Grid */
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
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
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
        font-size: 1.125rem;
    }

    .badges,
    .badge-priority {
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
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
        color: #666;
    }

    .badge-category {
        background: #f3f4f6;
        color: #6b7280;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .ticket-status {
        font-weight: 700;
        text-transform: capitalize;
    }

    /* Analytics */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }

    .stat-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
    }

    .stat-value {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
    }

    .stat-label {
        font-size: 0.875rem;
        opacity: 0.9;
    }

    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    .chart-card {
        background: #f9fafb;
        padding: 1.5rem;
        border-radius: 8px;
    }

    .bar-item {
        display: grid;
        grid-template-columns: 100px 1fr 60px;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.75rem;
    }

    .bar-label {
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: capitalize;
    }

    .bar-container {
        background: #e5e7eb;
        height: 24px;
        border-radius: 4px;
        overflow: hidden;
    }

    .bar {
        height: 100%;
        background: #667eea;
        transition: width 0.3s;
    }

    .bar-value {
        text-align: right;
        font-weight: 600;
        color: #666;
    }

    .table-container {
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }

    th {
        background: #f9fafb;
        font-weight: 600;
        color: #333;
    }

    tbody tr {
        cursor: pointer;
        transition: background 0.2s;
    }

    tbody tr:hover {
        background: #f9fafb;
    }

    /* Notifications */
    .notifications-list {
        display: grid;
        gap: 1rem;
    }

    .notification-card {
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        padding: 1rem;
    }

    .notification-header {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
    }

    .notification-type {
        background: #667eea;
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: capitalize;
    }

    .notification-channel {
        background: #f3f4f6;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }

    .notification-status {
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }

    .status-sent {
        background: #d1fae5;
        color: #065f46;
    }

    .status-pending {
        background: #fef3c7;
        color: #92400e;
    }

    .status-failed {
        background: #fee2e2;
        color: #991b1b;
    }

    .notification-message {
        color: #333;
        margin: 0.5rem 0;
    }

    .notification-footer {
        display: flex;
        gap: 1rem;
        font-size: 0.75rem;
        color: #666;
    }

    /* Modal */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: 2rem;
    }

    .modal {
        background: white;
        border-radius: 12px;
        max-width: 900px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 2rem;
        border-bottom: 2px solid #e0e0e0;
        position: sticky;
        top: 0;
        background: white;
        z-index: 1;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #666;
        padding: 0.25rem 0.5rem;
    }

    .close-btn:hover {
        color: #333;
    }

    .modal-body {
        padding: 2rem;
    }

    .section {
        margin-bottom: 2rem;
        padding-bottom: 2rem;
        border-bottom: 2px solid #e0e0e0;
    }

    .section:last-child {
        border-bottom: none;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .detail-row {
        margin-bottom: 1rem;
    }

    .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
    }

    .detail-item strong {
        display: block;
        color: #666;
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
    }

    /* Files */
    .files-list {
        display: grid;
        gap: 0.5rem;
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: #f9fafb;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .file-item:hover {
        background: #e5e7eb;
    }

    .file-icon {
        font-size: 2rem;
    }

    .file-name {
        font-weight: 600;
        color: #333;
    }

    .file-meta {
        font-size: 0.875rem;
        color: #666;
    }

    /* Feedback */
    .feedback-summary {
        background: #f9fafb;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }

    .rating-display {
        font-size: 1.125rem;
        color: #333;
    }

    .feedback-list {
        display: grid;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .feedback-item {
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        padding: 1rem;
    }

    .feedback-rating {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
    }

    .rating-selector {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .star-btn {
        background: none;
        border: none;
        font-size: 2rem;
        cursor: pointer;
        padding: 0.25rem;
        opacity: 0.3;
        transition: all 0.2s;
    }

    .star-btn.selected {
        opacity: 1;
        transform: scale(1.1);
    }

    /* Workflow */
    .workflow-grid {
        display: grid;
        gap: 1.5rem;
    }

    .control-group {
        display: grid;
        gap: 0.5rem;
    }

    .button-group {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .btn-workflow {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        background: #f3f4f6;
        color: #333;
        text-transform: capitalize;
    }

    .btn-workflow:hover {
        background: #e5e7eb;
    }

    .btn-workflow.active {
        background: #667eea;
        color: white;
    }

    /* History */
    .history-list {
        display: grid;
        gap: 0.75rem;
    }

    .history-item {
        background: #f9fafb;
        padding: 1rem;
        border-radius: 8px;
        font-size: 0.875rem;
    }

    .history-item code {
        background: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-family: monospace;
        color: #667eea;
    }

    /* Utility */
    .no-tickets,
    .no-data,
    .loading {
        text-align: center;
        color: #999;
        padding: 2rem;
        font-style: italic;
    }

    .upload-area {
        margin-bottom: 1rem;
    }
</style>
