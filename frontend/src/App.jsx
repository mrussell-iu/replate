
import { useEffect, useState } from "react";
import "./App.css";

// ============================================================
// API CONFIGURATION
// ============================================================

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const USERS_API = `${API_BASE}/api/users`;
const DONATIONS_API = `${API_BASE}/api/donations`;

// ============================================================
// DEFAULT FORM VALUES
// ============================================================

const emptyLogin = {
  email: "",
  password: ""
};

const emptyRegistration = {
  organization_name: "",
  organization_type: "",
  address: "",
  email: "",
  password: ""
};

const emptyDonation = {
  food_type: "",
  quantity: "",
  quantity_unit: "",
  pickup_address: "",
  pickup_date: "",
  pickup_time: "",
  claim_deadline: "",
  additional_information: ""
};

// ============================================================
// API HELPERS
// ============================================================

async function readResponse(response) {
  const type = response.headers.get("content-type") || "";

  if (!type.includes("application/json")) {
    throw new Error(
      `HTTP ${response.status}: Unexpected backend response.`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `HTTP ${response.status}: Invalid JSON response.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${
        data?.error || "Request failed."
      }`
    );
  }

  return data;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers
    }
  });

  return readResponse(response);
}

// ============================================================
// DATE HELPERS
// ============================================================

function formatDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function formatDateTime(value) {
  return value
    ? String(value).replace(" ", "T").slice(0, 16)
    : "";
}

// ============================================================
// REUSABLE DONATION FORM
// ============================================================

function DonationFields({ value, onChange }) {
  return (
    <>
      <label>
        Food Type
        <select
          name="food_type"
          value={value.food_type}
          onChange={onChange}
          required
        >
          <option value="">Select food type</option>
          <option value="Prepared Meals">Prepared Meals</option>
          <option value="Bakery Items">Bakery Items</option>
          <option value="Fresh Produce">Fresh Produce</option>
          <option value="Packaged Food">Packaged Food</option>
        </select>
      </label>

      <label>
        Quantity
        <input
          type="number"
          name="quantity"
          value={value.quantity}
          onChange={onChange}
          min="0.01"
          max="99999999.99"
          step="0.01"
          required
        />
      </label>

      <label>
        Unit
        <select
          name="quantity_unit"
          value={value.quantity_unit}
          onChange={onChange}
          required
        >
          <option value="">Select unit</option>
          <option value="servings">Servings</option>
          <option value="lbs">Pounds</option>
          <option value="boxes">Boxes</option>
          <option value="items">Items</option>
        </select>
      </label>

      <label>
        Pickup Address
        <input
          type="text"
          name="pickup_address"
          value={value.pickup_address}
          onChange={onChange}
          required
        />
      </label>

      <label>
        Pickup Date
        <input
          type="date"
          name="pickup_date"
          value={value.pickup_date}
          onChange={onChange}
          required
        />
      </label>

      <label>
        Pickup Time
        <input
          type="time"
          name="pickup_time"
          value={value.pickup_time}
          onChange={onChange}
          required
        />
      </label>

      <label>
        Claim Deadline
        <input
          type="datetime-local"
          name="claim_deadline"
          value={value.claim_deadline}
          onChange={onChange}
          required
        />
      </label>

      <label>
        Additional Information
        <textarea
          name="additional_information"
          value={value.additional_information}
          onChange={onChange}
          rows={3}
        />
      </label>
    </>
  );
}

// ============================================================
// MAIN APPLICATION
// ============================================================

function App() {
  // Authentication
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authPage, setAuthPage] = useState("login");

  const [loginForm, setLoginForm] = useState({
    ...emptyLogin
  });

  const [registration, setRegistration] = useState({
    ...emptyRegistration
  });

  // Donation forms
  const [form, setForm] = useState({
    ...emptyDonation
  });

  const [editForm, setEditForm] = useState({
    ...emptyDonation
  });

  // Donation data
  const [donations, setDonations] = useState([]);
  const [myClaims, setMyClaims] = useState([]);

  // Loading states
  const [loadingDonations, setLoadingDonations] =
    useState(false);

  const [busy, setBusy] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  // Feedback
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isDonor = currentUser?.role === "FOOD_DONOR";
  const isRecipient = currentUser?.role === "RECIPIENT";

  function clearMessages() {
    setMessage("");
    setError("");
  }

  function changeForm(setter) {
    return event => {
      const { name, value } = event.target;

      setter(previous => ({
        ...previous,
        [name]: value
      }));
    };
  }

  // ==========================================================
  // RESTORE SESSION
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch(
          `${USERS_API}/me`,
          { credentials: "include" }
        );

        if (response.status === 401) {
          if (active) setCurrentUser(null);
          return;
        }

        const data = await readResponse(response);

        if (active) {
          setCurrentUser(data.user);
        }
      } catch (err) {
        if (active) {
          setCurrentUser(null);
          setError(err.message);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // ==========================================================
  // LOAD DONATIONS AFTER LOGIN
  // ==========================================================

  useEffect(() => {
    if (!currentUser) {
      setDonations([]);
      setMyClaims([]);
      setLoadingDonations(false);
      return;
    }

    let active = true;

    async function loadData() {
      setLoadingDonations(true);

      try {
        const available = await api(DONATIONS_API);

        if (!Array.isArray(available)) {
          throw new Error("Invalid donation list received.");
        }

        if (active) {
          setDonations(available);
        }

        if (currentUser.role === "RECIPIENT") {
          const claims = await api(
            `${DONATIONS_API}/my-claims`
          );

          if (!Array.isArray(claims)) {
            throw new Error("Invalid claim history received.");
          }

          if (active) {
            setMyClaims(claims);
          }
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoadingDonations(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [currentUser]);

  async function refreshDonations() {
    const available = await api(DONATIONS_API);

    if (!Array.isArray(available)) {
      throw new Error("Invalid donation list received.");
    }

    setDonations(available);

    if (isRecipient) {
      const claims = await api(
        `${DONATIONS_API}/my-claims`
      );

      if (!Array.isArray(claims)) {
        throw new Error("Invalid claim history received.");
      }

      setMyClaims(claims);
    }
  }

  // ==========================================================
  // LOGIN
  // ==========================================================

  async function handleLogin(event) {
    event.preventDefault();

    if (busy) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await api(`${USERS_API}/login`, {
        method: "POST",
        body: JSON.stringify({
          email: loginForm.email.trim().toLowerCase(),
          password: loginForm.password
        })
      });

      setCurrentUser(data.user);
      setLoginForm({ ...emptyLogin });

      setMessage(
        data.message || "Login successful."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // REGISTRATION
  // ==========================================================

  async function handleRegistration(event) {
    event.preventDefault();

    if (busy) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await api(
        `${USERS_API}/register`,
        {
          method: "POST",
          body: JSON.stringify({
            ...registration,
            organization_name:
              registration.organization_name.trim(),
            address: registration.address.trim(),
            email:
              registration.email.trim().toLowerCase()
          })
        }
      );

      setRegistration({ ...emptyRegistration });
      setAuthPage("login");

      setMessage(
        `${data.message || "Registration successful."} Please log in.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // LOGOUT
  // ==========================================================

  async function handleLogout() {
    if (busy) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await api(
        `${USERS_API}/logout`,
        { method: "POST" }
      );

      setCurrentUser(null);
      setDonations([]);
      setMyClaims([]);

      setForm({ ...emptyDonation });
      setEditForm({ ...emptyDonation });

      setEditingId(null);
      setAuthPage("login");

      setMessage(
        data.message || "Logged out successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // POST DONATION
  // ==========================================================

  async function handlePost(event) {
    event.preventDefault();

    if (!isDonor || busy) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await api(DONATIONS_API, {
        method: "POST",
        body: JSON.stringify(form)
      });

      setForm({ ...emptyDonation });

      await refreshDonations();

      setMessage(
        `${data.message || "Donation posted successfully."} Donation ID: ${data.donation_id}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // CLAIM DONATION
  // ==========================================================

  async function handleClaim(id) {
    if (!isRecipient || claimingId !== null) return;

    clearMessages();
    setClaimingId(id);

    try {
      const data = await api(
        `${DONATIONS_API}/${id}/claim`,
        {
          method: "POST",
          body: "{}"
        }
      );

      await refreshDonations();

      setMessage(
        data.message || "Donation claimed successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setClaimingId(null);
    }
  }

  // ==========================================================
  // CONFIRM PICKUP
  // ==========================================================

  async function handleConfirmPickup(id) {
    if (!isRecipient || confirmingId !== null) return;

    const confirmed = window.confirm(
      `Confirm that you collected donation #${id}?`
    );

    if (!confirmed) return;

    clearMessages();
    setConfirmingId(id);

    try {
      const data = await api(
        `${DONATIONS_API}/${id}/confirm-pickup`,
        {
          method: "POST",
          body: "{}"
        }
      );

      await refreshDonations();

      setMessage(
        data.message || "Pickup confirmed successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingId(null);
    }
  }

  // ==========================================================
  // EDIT DONATION
  // ==========================================================

  function startEditing(donation) {
    if (
      !isDonor ||
      Number(donation.organization_id) !==
        Number(currentUser.organization_id)
    ) {
      setError(
        "You cannot edit this donation."
      );
      return;
    }

    clearMessages();

    setEditingId(donation.donation_id);

    setEditForm({
      food_type: donation.food_type || "",
      quantity: String(donation.quantity ?? ""),
      quantity_unit: donation.quantity_unit || "",
      pickup_address: donation.pickup_address || "",
      pickup_date: formatDate(donation.pickup_date),
      pickup_time: formatTime(donation.pickup_time),
      claim_deadline: formatDateTime(
        donation.claim_deadline
      ),
      additional_information:
        donation.additional_information || ""
    });
  }

  async function handleSaveEdit(event) {
    event.preventDefault();

    if (!isDonor || busy || editingId === null) return;

    clearMessages();
    setBusy(true);

    try {
      const data = await api(
        `${DONATIONS_API}/${editingId}`,
        {
          method: "PUT",
          body: JSON.stringify(editForm)
        }
      );

      setEditingId(null);
      setEditForm({ ...emptyDonation });

      await refreshDonations();

      setMessage(
        data.message || "Donation updated successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // FILTER CLAIM HISTORY
  // ==========================================================

  const claimed = myClaims.filter(
    donation => donation.status === "CLAIMED"
  );

  const completed = myClaims.filter(
    donation => donation.status === "COMPLETED"
  );

  // ==========================================================
  // SHARED UI
  // ==========================================================

  const header = (
    <header>
      <h1>Replate</h1>
      <p>
        Food Surplus Donation Management System
      </p>
    </header>
  );

  const feedback = (
    <>
      {message && (
        <p role="status">{message}</p>
      )}

      {error && (
        <p role="alert">Error: {error}</p>
      )}
    </>
  );

  // ==========================================================
  // LOADING SCREEN
  // ==========================================================

  if (authLoading) {
    return (
      <main className="app">
        {header}

        <section>
          <h2>Loading Replate...</h2>
          <p>Checking your login session.</p>
        </section>
      </main>
    );
  }

  // ==========================================================
  // PUBLIC LOGIN / REGISTER SCREEN
  // ==========================================================

  if (!currentUser) {
    return (
      <main className="app">
        {header}

        <section>
          <h2>Welcome to Replate</h2>

          <p>
            Log in or register to access your dashboard.
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={
                authPage === "login" ? "active" : ""
              }
              onClick={() => {
                clearMessages();
                setAuthPage("login");
              }}
            >
              Login
            </button>

            <button
              type="button"
              className={
                authPage === "register" ? "active" : ""
              }
              onClick={() => {
                clearMessages();
                setAuthPage("register");
              }}
            >
              Register
            </button>
          </div>

          {authPage === "login" ? (
            <>
              <h3>Login to Your Account</h3>

              <form onSubmit={handleLogin}>
                <label>
                  Email Address
                  <input
                    type="email"
                    name="email"
                    value={loginForm.email}
                    onChange={changeForm(setLoginForm)}
                    autoComplete="username"
                    required
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    value={loginForm.password}
                    onChange={changeForm(setLoginForm)}
                    autoComplete="current-password"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Logging in..." : "Login"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h3>Create an Account</h3>

              <form onSubmit={handleRegistration}>
                <label>
                  Organization Name
                  <input
                    type="text"
                    name="organization_name"
                    value={registration.organization_name}
                    onChange={changeForm(setRegistration)}
                    required
                  />
                </label>

                <label>
                  Organization Type
                  <select
                    name="organization_type"
                    value={registration.organization_type}
                    onChange={changeForm(setRegistration)}
                    required
                  >
                    <option value="">
                      Select organization type
                    </option>

                    <option value="FOODSERVICE">
                      Foodservice Donor
                    </option>

                    <option value="RECIPIENT">
                      Food Assistance Recipient
                    </option>
                  </select>
                </label>

                <label>
                  Organization Address
                  <input
                    type="text"
                    name="address"
                    value={registration.address}
                    onChange={changeForm(setRegistration)}
                    required
                  />
                </label>

                <label>
                  Email Address
                  <input
                    type="email"
                    name="email"
                    value={registration.email}
                    onChange={changeForm(setRegistration)}
                    required
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    value={registration.password}
                    onChange={changeForm(setRegistration)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? "Registering..."
                    : "Create Account"}
                </button>
              </form>
            </>
          )}
        </section>

        {feedback}
      </main>
    );
  }

  // ==========================================================
  // AUTHENTICATED DASHBOARD
  // ==========================================================

  return (
    <main className="app">
      {header}

      {/* ACCOUNT INFORMATION */}

      <section>
        <div className="dashboard-header">
          <div>
            <h2>Welcome Back!</h2>
            <p>{currentUser.organization_name}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
          >
            {busy ? "Please wait..." : "Logout"}
          </button>
        </div>

        <p>
          <strong>Email:</strong>{" "}
          {currentUser.email}
        </p>

        <p>
          <strong>Role:</strong>{" "}
          {isDonor
            ? "Food Donor"
            : isRecipient
              ? "Food Recipient"
              : currentUser.role}
        </p>
      </section>

      {/* DONOR POSTING */}

      {isDonor && (
        <section>
          <h2>Post a Donation</h2>

          <form onSubmit={handlePost}>
            <DonationFields
              value={form}
              onChange={changeForm(setForm)}
            />

            <button
              type="submit"
              disabled={busy}
            >
              {busy ? "Posting..." : "Post Donation"}
            </button>
          </form>
        </section>
      )}

      {/* AVAILABLE DONATIONS */}

      <section>
        <h2>Available Donations</h2>

        {loadingDonations ? (
          <p>Loading donations...</p>
        ) : (
          <div className="donations-list">
            {donations.length === 0 ? (
              <p>No donations available.</p>
            ) : (
              donations.map(donation => {
                const ownsDonation =
                  isDonor &&
                  Number(donation.organization_id) ===
                    Number(currentUser.organization_id);

                return (
                  <article
                    key={donation.donation_id}
                    className="donation-card"
                  >
                    <h3>{donation.food_type}</h3>

                    <p>
                      <strong>Donation ID:</strong>{" "}
                      {donation.donation_id}
                    </p>

                    <p>
                      <strong>Donor:</strong>{" "}
                      {donation.organization_name}
                    </p>

                    <p>
                      <strong>Quantity:</strong>{" "}
                      {donation.quantity}{" "}
                      {donation.quantity_unit}
                    </p>

                    <p>
                      <strong>Pickup:</strong>{" "}
                      {donation.pickup_address}
                    </p>

                    <p>
                      <strong>Status:</strong>{" "}
                      {donation.status}
                    </p>

                    {isRecipient && (
                      <button
                        type="button"
                        disabled={claimingId !== null}
                        onClick={() =>
                          handleClaim(donation.donation_id)
                        }
                      >
                        {claimingId === donation.donation_id
                          ? "Claiming..."
                          : "Claim Donation"}
                      </button>
                    )}

                    {ownsDonation && (
                      <button
                        type="button"
                        onClick={() =>
                          startEditing(donation)
                        }
                      >
                        Edit Donation
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* RECIPIENT CLAIMED DONATIONS */}

      {isRecipient && (
        <section>
          <h2>My Claimed Donations</h2>

          <p>
            Confirm pickup only after collecting
            the food from the donor.
          </p>

          <div className="donations-list">
            {claimed.length === 0 ? (
              <p>No donations awaiting pickup.</p>
            ) : (
              claimed.map(donation => (
                <article
                  key={donation.donation_id}
                  className="donation-card"
                >
                  <h3>{donation.food_type}</h3>

                  <p>
                    <strong>Donation ID:</strong>{" "}
                    {donation.donation_id}
                  </p>

                  <p>
                    <strong>Donor:</strong>{" "}
                    {donation.organization_name}
                  </p>

                  <p>
                    <strong>Quantity:</strong>{" "}
                    {donation.quantity}{" "}
                    {donation.quantity_unit}
                  </p>

                  <p>
                    <strong>Pickup Address:</strong>{" "}
                    {donation.pickup_address}
                  </p>

                  <p>
                    <strong>Pickup Date:</strong>{" "}
                    {formatDate(donation.pickup_date)}
                  </p>

                  <p>
                    <strong>Pickup Time:</strong>{" "}
                    {formatTime(donation.pickup_time)}
                  </p>

                  <p>
                    <strong>Status:</strong> CLAIMED
                  </p>

                  <button
                    type="button"
                    disabled={confirmingId !== null}
                    onClick={() =>
                      handleConfirmPickup(
                        donation.donation_id
                      )
                    }
                  >
                    {confirmingId === donation.donation_id
                      ? "Confirming..."
                      : "Confirm Pickup"}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* PICKUP HISTORY */}

      {isRecipient && (
        <section>
          <h2>My Pickup History</h2>

          <div className="donations-list">
            {completed.length === 0 ? (
              <p>No completed pickups yet.</p>
            ) : (
              completed.map(donation => (
                <article
                  key={donation.donation_id}
                  className="donation-card"
                >
                  <h3>{donation.food_type}</h3>

                  <p>
                    <strong>Donation ID:</strong>{" "}
                    {donation.donation_id}
                  </p>

                  <p>
                    <strong>Donor:</strong>{" "}
                    {donation.organization_name}
                  </p>

                  <p>
                    <strong>Status:</strong> COMPLETED
                  </p>

                  <p>
                    <strong>Confirmed:</strong>{" "}
                    {donation.pickup_confirmed_at ||
                      "Recorded"}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* DONOR EDITING */}

      {isDonor && editingId !== null && (
        <section>
          <h2>Edit Donation #{editingId}</h2>

          <form onSubmit={handleSaveEdit}>
            <DonationFields
              value={editForm}
              onChange={changeForm(setEditForm)}
            />

            <button
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingId(null);
                setEditForm({ ...emptyDonation });
              }}
            >
              Cancel Editing
            </button>
          </form>
        </section>
      )}

      {feedback}
    </main>
  );
}

export default App;
