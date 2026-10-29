
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:3000/api/donations";

const emptyForm = {
  food_type: "",
  quantity: "",
  quantity_unit: "",
  pickup_address: "",
  pickup_date: "",
  pickup_time: "",
  claim_deadline: "",
  additional_information: ""
};

function App() {
  const [form, setForm] = useState(emptyForm);
  const [donations, setDonations] = useState([]);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState(null);

  async function loadDonations() {
    try {
      const response = await fetch(API_URL);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to retrieve donations."
        );
      }

      setDonations(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDonations();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to post donation."
        );
      }

      setMessage(
        data.message || "Donation posted successfully."
      );

      setForm({ ...emptyForm });
      await loadDonations();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(donationId) {
    setMessage("");
    setError("");

    const id = Number(donationId);
    const recipientId = Number(recipientUserId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("Invalid donation ID.");
      return;
    }

    if (
      !recipientUserId ||
      !Number.isSafeInteger(recipientId) ||
      recipientId <= 0
    ) {
      setError("Please enter a valid recipient user ID.");
      return;
    }

    setClaimingId(id);

    try {
      const response = await fetch(
        `${API_URL}/${id}/claim`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient_user_id: recipientId
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to claim donation."
        );
      }

      setMessage(
        data.message || "Donation claimed successfully."
      );

      await loadDonations();

    } catch (err) {
      setError(err.message);
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Replate</h1>
        <p>Surplus Food Donation Management System</p>
      </header>

      <section>
        <h2>Post a Donation</h2>

        <form onSubmit={handleSubmit}>
          <label>
            Food Type
            <select
              name="food_type"
              value={form.food_type}
              onChange={handleChange}
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
              value={form.quantity}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              required
            />
          </label>

          <label>
            Unit
            <select
              name="quantity_unit"
              value={form.quantity_unit}
              onChange={handleChange}
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
              value={form.pickup_address}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Pickup Date
            <input
              type="date"
              name="pickup_date"
              value={form.pickup_date}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Pickup Time
            <input
              type="time"
              name="pickup_time"
              value={form.pickup_time}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Claim Deadline
            <input
              type="datetime-local"
              name="claim_deadline"
              value={form.claim_deadline}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Additional Information
            <textarea
              name="additional_information"
              value={form.additional_information}
              onChange={handleChange}
              rows="3"
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Posting..." : "Post Donation"}
          </button>
        </form>
      </section>

      <section>
        <h2>Available Donations</h2>

        <label>
          Demo Recipient User ID
          <input
            type="number"
            min="1"
            value={recipientUserId}
            onChange={event =>
              setRecipientUserId(event.target.value)
            }
            placeholder="Enter recipient user ID"
          />
        </label>

        <div className="donations-list">
          {donations.length === 0 ? (
            <p>No donations available.</p>
          ) : (
            donations.map(donation => (
              <article
                key={donation.donation_id}
                className="donation-card"
              >
                <h3>{donation.food_type}</h3>

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
              </article>
            ))
          )}
        </div>
      </section>

      {message && (
        <p role="status">{message}</p>
      )}

      {error && (
        <p role="alert">Error: {error}</p>
      )}
    </main>
  );
}

export default App;
