# Project 1: Office Room & Desk Reservation System

**Course:** Proiect Colectiv
**Team size (suggested):** 5–7 students
**Duration (suggested):** 1 semester (~14 weeks)
**Technology (given):** Spring Boot, Angular, PostgreSQL. Teams receive a starter project in which registration and login are already implemented.

---

## 1. Context and Motivation

With hybrid work now common, companies often have fewer desks than employees, and meeting rooms are a constantly contested resource. Booking is frequently handled through spreadsheets, shared calendars, or e-mail, which leads to double bookings, unused "ghost" reservations, and no clear picture of how office space is used.

This project aims to build a web application that lets organisations model their physical office space (buildings, floors, rooms, desks), visualise it on interactive floor plans, and let employees reserve what they need. Administrators keep full control over the space layout and over existing reservations.

## 2. Project Goals

- Allow administrators to model the physical structure of an organisation: buildings, floors, meeting rooms and desks.
- Provide a visual, canvas-based floor plan editor and viewer.
- Let employees quickly find and book free desks and meeting rooms.
- Give administrators tools to manage, edit and cancel bookings.
- Deliver a maintainable, tested, documented system developed with professional team practices (Git, code review, CI, agile process).

## 3. User Roles

| Role                | Description                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Employee (User)** | Registers/logs in, browses floor plans, searches availability, creates and manages their own bookings.           |
| **Administrator**   | Everything an employee can do, plus managing buildings, floors, floor plans, resources, users, and all bookings. |

## 4. Functional Requirements

### 4.1 User Management and Roles

- Role-based access control (Employee / Admin).
- Profile page (name, e-mail, department, preferences such as a favourite desk).
- Admin can create, deactivate and change roles of users.

### 4.2 Space Management (Admin)

- **Buildings:** create, edit, delete (name, address, opening hours, time zone).
- **Floors:** add floors to a building (name/number, ordering); edit and remove floors.
- **Resources:** add, edit and remove resources on a floor:
  - _Desks_ (label, equipment such as monitor/docking station, notes)
  - _Meeting rooms_ (name, capacity, equipment such as projector/whiteboard/video conferencing)
  - Optional: other areas (phone booths, break rooms, parking spots)
- Mark a resource as temporarily unavailable (maintenance, restricted use).

### 4.3 Floor Plan Editor (Canvas)

- Interactive canvas for each floor, where the admin can draw and arrange:
  - walls / floor outline and zones
  - meeting rooms (rectangles/polygons) with labels
  - desks (placeable, draggable, rotatable icons)
  - optional elements: doors, windows, stairs, elevators, plants (decorative)
- Tools: select, move, resize, rotate, delete, copy/paste, snap-to-grid, zoom and pan, undo/redo.
- Link each drawn element to a resource in the database (e.g. clicking a desk shape binds it to _Desk 3.14_).
- Save and load the floor plan (stored e.g. as JSON).
- Optional: upload a background image (PDF/PNG of an architectural plan) and draw over it.

### 4.4 Booking (Employee)

- **Floor plan view:** select a building and floor, pick a date (and time range), and see the plan colour-coded:
  - free / booked / unavailable / booked by me
- Click on a desk or room to see details and book it directly from the map.
- **Desk booking:** by day, half day, or custom time slot.
- **Meeting room booking:** start/end time, title, optional description, attendee list.
- **Search for free rooms:** filter by date/time, capacity, equipment, building/floor; show only available results.
- "My bookings" page: list of upcoming and past bookings, with the option to modify or cancel.
- Prevent conflicts: no overlapping bookings for the same resource (including under concurrent requests).
- Recurring bookings (e.g. every Monday).
- See which colleagues are in the office on a given day and book a desk near them.
- Calendar integration: export bookings as iCal or sync to Google/Outlook calendar (optional).
- Notifications: e-mail confirmation, reminders, and cancellation notices.

### 4.5 Booking Administration (Admin)

- View all bookings with filters (building, floor, resource, user, date range, status).
- Edit a booking (change time, resource or user) with conflict validation.
- Cancel/delete bookings, with an optional reason that is sent to the affected user.
- Block time ranges on a resource (maintenance, company events).
- Configurable booking rules: maximum booking duration, how far in advance a booking is allowed, and per-user limits.
- Calendar view of bookings per resource, floor, or building.

### 4.6 Reporting and Check-in

- Utilisation statistics: occupancy rate per day/floor/room, peak hours, most/least used resources.
- "Check-in" feature that releases unclaimed bookings (no-shows) after a grace period.
- Export reports to CSV.

## 5. Non-Functional Requirements

- **Usability:** intuitive, responsive UI (desktop first, usable on mobile for booking).
- **Performance:** floor plan renders smoothly with up to several hundred elements; availability queries respond in under 1 second under normal load.
- **Security:** input validation, protection against common attacks (OWASP Top 10), authorisation checks on every admin endpoint.
- **Data integrity:** booking conflicts must be prevented at the database level (transactions/constraints), not only in the UI.
- **Maintainability:** layered architecture, clean code, documented REST API (e.g. OpenAPI/Swagger).
- **Testing:** unit tests for business logic, integration tests for the API, a few end-to-end tests for key flows.
- **Deployment:** reproducible setup via Docker / docker-compose.
