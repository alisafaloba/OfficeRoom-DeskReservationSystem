# Project 2: Company Engagement Platform

**Course:** Proiect colectiv
**Team size (suggested):** 5–7 students
**Duration (suggested):** 1 semester (~14 weeks)
**Technology (given):** Spring Boot, Angular, PostgreSQL. Teams receive a starter project in which registration and login are already implemented.

---

## 1. Context and Motivation

In modern companies, especially hybrid and distributed ones, employees often feel disconnected from leadership, other departments, and company news. Important announcements get lost in e-mail threads, and informal communication happens in scattered chat channels.

This project aims to build an internal social and communication platform, similar to Microsoft Viva Engage (formerly Yammer). It lets leadership and employees share announcements and ideas, and lets everyone react, comment, and join conversations in communities organised around teams, topics, or interests.

## 2. Project Goals

- Provide a central place for company-wide and group-level communication.
- Let employees post, react to, comment on, and share content.
- Organise conversations into communities (groups) with their own membership and rules.
- Keep users informed through a personalised feed and notifications.
- Give administrators and moderators tools to manage content and users.
- Deliver a maintainable, tested, documented system built with professional team practices (Git, code review, CI, agile process).

## 3. User Roles

| Role                            | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Employee (Member)**           | Posts, comments, reacts, joins communities, follows colleagues, receives notifications.                     |
| **Community Admin / Moderator** | Manages a specific community: members, pinned posts, removal of inappropriate content.                      |
| **Company Admin**               | Manages users, roles, and communities platform-wide, handles reports, and views analytics.                  |
| **Leadership / Announcer**      | Employee permitted to publish company-wide announcements (can be a permission rather than a separate role). |

## 4. Functional Requirements

### 4.1 User Profiles and Roles

- Role-based access control.
- User profile: name, photo, job title, department, location, short bio, interests.
- Searchable employee directory.
- Follow/unfollow colleagues.

### 4.2 Posts and Announcements

- Create posts with rich text (bold, italic, lists, links, mentions `@user`, hashtags `#topic`).
- Attach images, files, and links (with link preview).
- Post types:
  - **Discussion:** open conversation
  - **Question:** can have a marked "best answer"
  - **Announcement:** highlighted, published by authorised users, optionally with a required read confirmation
  - **Poll:** with options, optional deadline, and live results
  - **Praise/Kudos (optional):** recognise a colleague
- Edit and delete own posts; drafts and scheduled publishing (optional).
- Pin posts (company-wide or in a community).
- Audience selection: whole company or a specific community.

### 4.3 Reactions, Comments, and Interaction

- **Reactions** on posts and comments: like, love, celebrate, insightful, etc. A user can have one reaction per item and can change or remove it.
- See who reacted and the count per reaction type.
- **Comments** with nested replies (at least one level), editing, and deletion.
- Mentions in comments with notifications.
- Share or bookmark posts ("save for later").
- Report inappropriate content.

### 4.4 Communities (Groups)

- Create communities: public (anyone can join) or private (join by request or invitation).
- Community page: description, cover image, rules, member list, posts feed.
- Roles inside a community: member, moderator, admin.
- Join, leave, invite, approve, or reject join requests.
- Company admin can create official communities (e.g. "All Company", "HR News", "IT Support").

### 4.5 Feed and Discovery

- **Home feed:** personalised mix of posts from followed people and joined communities, plus company announcements.
- Sorting: latest, most popular (based on reactions and comments).
- Filters: community, post type, hashtag.
- **Search:** posts, people, communities, hashtags.
- Trending topics and suggested communities.
- Infinite scroll or pagination.

### 4.6 Notifications

- In-app notification centre (reactions, comments, replies, mentions, new followers, community invites, new announcements).
- Unread counter and "mark all as read".
- E-mail notifications (optional digest) with user-configurable preferences.
- Real-time updates (WebSockets or Server-Sent Events) – recommended.

### 4.7 Moderation and Administration

- Review queue for reported content: dismiss, hide, or delete, and warn or suspend the author.
- Admin dashboard: manage users (activate/deactivate, change roles), communities, and announcements.
- Audit log of moderation actions.

### 4.8 Analytics (Admin, optional but recommended)

- Engagement metrics: active users, posts per day, reactions and comments per post, top communities, top contributors.
- Announcement reach: number of views and read confirmations.
- Charts and CSV export.

## 5. Non-Functional Requirements

- **Usability:** clean, responsive UI usable on desktop and mobile; accessible (keyboard navigation, sensible contrast).
- **Performance:** feed loads in under 1–2 seconds for typical data volumes; efficient pagination and indexing on large post/comment tables.
- **Security:** input sanitisation (XSS-safe rich text), file upload validation, authorisation checks on every endpoint (e.g. private community content must not leak).
- **Scalability mindset:** avoid N+1 queries; consider caching for counters and feeds.
- **Maintainability:** layered architecture, clean code, documented REST/GraphQL API (OpenAPI/Swagger).
- **Testing:** unit tests for business logic, integration tests for the API, and a few end-to-end tests for key flows.
- **Deployment:** reproducible setup via Docker / docker-compose.
