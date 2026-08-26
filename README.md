# WorkFlow

A backend-focused project management and issue-tracking platform built with
Node.js, Express.js, and PostgreSQL.

WorkFlow provides secure REST APIs for authentication, project management,
project membership, and issue/task management. The backend follows a layered
architecture with controllers, services, repositories, middleware, validation,
and PostgreSQL transactions.

The project is being developed incrementally with automated testing and
Swagger/OpenAPI documentation.

---

## Features

### Authentication & Security

- User registration and login
- JWT-based access tokens
- Refresh token rotation
- Hashed refresh tokens stored in PostgreSQL
- Secure password hashing with bcrypt
- Authentication middleware
- Role-based access control (RBAC)
- Protected API endpoints
- Input validation with Zod
- Centralized error handling

### User Roles

WorkFlow currently supports:

- `admin`
- `project_manager`
- `developer`
- `viewer`

Permissions are enforced at the API level.

---

## Project Management

Users can:

- Create projects
- View projects they belong to
- View individual projects
- Update project details
- Archive projects
- Add project members
- Assign project roles
- Remove project members

Project creation uses a PostgreSQL transaction to atomically create the
project and add the creator as the initial project owner.

Projects are archived using a soft-delete approach rather than being
physically removed from the database.

---

## Issue & Task Management

WorkFlow includes an issue-management module for tracking work within
projects.

Supported operations include:

- Create issues
- List project issues
- View individual issues
- Update issues
- Change issue status
- Assign issues
- Delete issues
- Filter issues
- Search issues by title
- Sort issues
- Paginate issue results

Issue listing supports filters such as:

- Status
- Priority
- Type
- Assignee
- Title search

Paginated responses include metadata such as total records and total pages.

---

## Issue Activity & Audit Trail

Changes to important issue fields are recorded in the
`issue_activity` table.

Activity is recorded when changing:

- Status
- Priority
- Assignee

Issue updates and their corresponding activity records are performed inside
the same PostgreSQL transaction.

This prevents the issue state and audit history from becoming inconsistent.

For example:

```text
BEGIN

Update issue status
       +
Insert issue activity

COMMIT
