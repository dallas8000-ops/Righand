# RigHand AI - API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### Authentication

#### Register New User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "driver@example.com",
  "password": "securepassword123",
  "name": "John Doe",
  "truckerLicense": "CDL123456"
}
```

**Response (201):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "driver@example.com",
    "name": "John Doe",
    "truckerLicense": "CDL123456",
    "createdAt": "2024-01-15T10:30:00",
    "updatedAt": "2024-01-15T10:30:00"
  }
}
```

**Errors:**
- `400`: Missing required fields
- `409`: Email or license already registered
- `500`: Server error

---

#### Login User
```http
POST /auth/login
Content-Type: application/json

{
  "email": "driver@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "driver@example.com",
    "name": "John Doe",
    "truckerLicense": "CDL123456",
    "createdAt": "2024-01-15T10:30:00",
    "updatedAt": "2024-01-15T10:30:00"
  }
}
```

**Errors:**
- `400`: Missing email or password
- `401`: Invalid credentials
- `500`: Server error

---

#### Verify Token
```http
GET /auth/verify
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "driver@example.com",
    "name": "John Doe",
    "truckerLicense": "CDL123456",
    "createdAt": "2024-01-15T10:30:00",
    "updatedAt": "2024-01-15T10:30:00"
  }
}
```

**Errors:**
- `404`: User not found
- `401`: Invalid token
- `500`: Server error

---

#### Logout
```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Expenses

#### Create Expense
```http
POST /expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Fuel stop at TA/Petro",
  "amount": 125.50,
  "category": "fuel",
  "type": "expense",
  "date": "2024-01-15",
  "notes": "Filled up tank"
}
```

**Parameters:**
- `description` (string, required): Description of the expense/income
- `amount` (number, required): Dollar amount
- `category` (string, required): One of: fuel, maintenance, tolls, food, other, load
- `type` (string, required): Either "expense" or "income"
- `date` (string, required): ISO date format (YYYY-MM-DD)
- `notes` (string, optional): Additional notes

**Response (201):**
```json
{
  "success": true,
  "id": "expense-550e8400-e29b-41d4-a716-446655440000",
  "expense": {
    "id": "expense-550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-550e8400-e29b-41d4-a716-446655440001",
    "description": "Fuel stop at TA/Petro",
    "amount": 125.50,
    "category": "fuel",
    "type": "expense",
    "date": "2024-01-15",
    "notes": "Filled up tank",
    "synced": true,
    "createdAt": "2024-01-15T10:35:00",
    "updatedAt": "2024-01-15T10:35:00"
  }
}
```

---

#### Get User Expenses
```http
GET /expenses/user/{userId}
Authorization: Bearer <token>
```

**Query Parameters (optional):**
- `startDate`: Filter from date (ISO format)
- `endDate`: Filter to date (ISO format)

**Example:**
```
GET /expenses/user/550e8400-e29b-41d4-a716-446655440001?startDate=2024-01-01&endDate=2024-01-31
```

**Response (200):**
```json
{
  "success": true,
  "expenses": [
    {
      "id": "exp1",
      "userId": "user1",
      "description": "Fuel stop",
      "amount": 125.50,
      "category": "fuel",
      "type": "expense",
      "date": "2024-01-15",
      "synced": true,
      "createdAt": "2024-01-15T10:35:00",
      "updatedAt": "2024-01-15T10:35:00"
    },
    {
      "id": "exp2",
      "userId": "user1",
      "description": "Load payment",
      "amount": 800.00,
      "category": "load",
      "type": "income",
      "date": "2024-01-14",
      "synced": true,
      "createdAt": "2024-01-14T15:20:00",
      "updatedAt": "2024-01-14T15:20:00"
    }
  ]
}
```

**Errors:**
- `403`: Cannot view other user's expenses
- `404`: User not found
- `500`: Server error

---

#### Update Expense
```http
PUT /expenses/{expenseId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Updated fuel stop",
  "amount": 130.00,
  "category": "fuel"
}
```

**Parameters:**
- All parameters are optional
- Only provide fields to update

**Response (200):**
```json
{
  "success": true,
  "expense": {
    "id": "exp1",
    "userId": "user1",
    "description": "Updated fuel stop",
    "amount": 130.00,
    "category": "fuel",
    "type": "expense",
    "date": "2024-01-15",
    "synced": true,
    "createdAt": "2024-01-15T10:35:00",
    "updatedAt": "2024-01-15T11:00:00"
  }
}
```

**Errors:**
- `403`: Cannot update other user's expense
- `404`: Expense not found
- `500`: Server error

---

#### Delete Expense
```http
DELETE /expenses/{expenseId}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Expense deleted"
}
```

**Errors:**
- `403`: Cannot delete other user's expense
- `404`: Expense not found
- `500`: Server error

---

#### Calculate Profit
```http
GET /expenses/profit
Authorization: Bearer <token>
```

**Query Parameters:**
- `startDate` (optional): ISO format date
- `endDate` (optional): ISO format date

**Example:**
```
GET /expenses/profit?startDate=2024-01-01&endDate=2024-01-31
```

**Response (200):**
```json
{
  "success": true,
  "totalIncome": 2400.00,
  "totalExpenses": 580.50,
  "netProfit": 1819.50,
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid/missing token |
| 403 | Forbidden - User not authorized for resource |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 500 | Server Error - Unexpected error |

---

## Error Response Format

All errors follow this format:
```json
{
  "error": "Error message describing the issue"
}
```

**Example:**
```json
{
  "error": "Invalid credentials"
}
```

---

## Rate Limiting

Currently no rate limiting implemented. Recommended for production:
- 100 requests per minute per user
- 1000 requests per minute per IP

---

## Webhooks

No webhooks currently implemented. Future considerations:
- Expense sync notifications
- Monthly summary reports
- Anomaly detection alerts

---

## Testing with cURL

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "name": "Test Driver",
    "truckerLicense": "CDL999"
  }'
```

### Create Expense
```bash
curl -X POST http://localhost:5000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Fuel",
    "amount": 100,
    "category": "fuel",
    "type": "expense",
    "date": "2024-01-15"
  }'
```

### Get Expenses
```bash
curl -X GET http://localhost:5000/api/expenses/user/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Changelog

### v1.0.0 (2024-01-15)
- Initial API release
- User authentication
- Expense CRUD operations
- Profit calculation

---

For implementation examples, see the [frontend services](../frontend/src/services/api.js).
