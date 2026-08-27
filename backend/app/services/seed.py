import asyncio
from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal, engine, Base, init_db
from app.core.security import get_password_hash
from app.models.models import (
    Organization, User, Role, Permission, OrganizationMember, Team, TeamMember, Channel, Message,
    PresenceStatus, TeamPrivacy, ChannelType, MemberRole, MessageType
)

async def seed_data():
    await init_db()

    async with AsyncSessionLocal() as db:
        print("🌱 Seeding database with Acme Corp initial data...")

        # 1. Roles & Permissions
        org_admin_role = (await db.execute(select(Role).where(Role.name == "ORG_ADMIN"))).scalars().first()
        if not org_admin_role:
            org_admin_role = Role(name="ORG_ADMIN", description="Organization Administrator")
            db.add(org_admin_role)

        user_role = (await db.execute(select(Role).where(Role.name == "USER"))).scalars().first()
        if not user_role:
            user_role = Role(name="USER", description="Standard Enterprise Member")
            db.add(user_role)

        await db.flush()

        # 2. Check Organization
        org_res = await db.execute(select(Organization).where(Organization.slug == "acme-corp"))
        org = org_res.scalars().first()

        if not org:
            org = Organization(
                name="Acme Corporation",
                slug="acme-corp",
                description="Global Leader in Enterprise Innovation"
            )
            db.add(org)
            await db.flush()

        # 3. Seed Users
        users_seed = [
            ("admin@example.com", "admin", "Alex", "Vance", "System Administrator", "IT", org_admin_role.id),
            ("alice@example.com", "alice", "Alice", "Smith", "Lead Architect", "Engineering", user_role.id),
            ("bob@example.com", "bob", "Bob", "Jones", "Senior Product Manager", "Product", user_role.id),
            ("charlie@example.com", "charlie", "Charlie", "Brown", "DevOps Specialist", "DevOps", user_role.id),
            ("diana@example.com", "diana", "Diana", "Prince", "VP of Engineering", "Executive", user_role.id),
            ("ethan@example.com", "ethan", "Ethan", "Hunt", "Cybersecurity Lead", "Security", user_role.id),
            ("fiona@example.com", "fiona", "Fiona", "Gallagher", "Principal UX Designer", "Design", user_role.id),
            ("george@example.com", "george", "George", "Clark", "Engineering Manager", "Engineering", user_role.id),
        ]

        created_users = {}
        for email, username, first, last, job, dept, role_id in users_seed:
            u_res = await db.execute(select(User).where(User.email == email))
            user = u_res.scalars().first()
            if not user:
                user = User(
                    organization_id=org.id,
                    role_id=role_id,
                    email=email,
                    username=username,
                    hashed_password=get_password_hash("password123"),
                    first_name=first,
                    last_name=last,
                    display_name=f"{first} {last}",
                    job_title=job,
                    department=dept,
                    presence=PresenceStatus.AVAILABLE,
                    is_active=True
                )
                db.add(user)
                await db.flush()
                # Create org member record
                org_member = OrganizationMember(
                    organization_id=org.id,
                    user_id=user.id,
                    role="ADMIN" if email == "admin@example.com" else "MEMBER"
                )
                db.add(org_member)
            created_users[username] = user

        org.owner_id = created_users["admin"].id

        # 4. Seed Teams
        teams_seed = [
            ("Engineering", "Core Software Engineering & Architecture Team", [
                ("General", "General engineering discussions"),
                ("Backend", "FastAPI, PostgreSQL & Distributed Systems"),
                ("Frontend", "React, TypeScript & Vite Architecture"),
                ("DevOps", "CI/CD Pipelines & Containerization")
            ]),
            ("Product", "Product Roadmap, Strategy & UX Design", [
                ("General", "Product announcements and roadmap updates")
            ]),
            ("DevOps", "Infrastructure & Security Reliability", [
                ("General", "Platform infrastructure updates")
            ])
        ]

        for team_name, team_desc, channels_list in teams_seed:
            t_res = await db.execute(select(Team).where(Team.name == team_name, Team.organization_id == org.id))
            team = t_res.scalars().first()
            if not team:
                team = Team(
                    organization_id=org.id,
                    name=team_name,
                    description=team_desc,
                    privacy=TeamPrivacy.PUBLIC,
                    owner_id=created_users["admin"].id
                )
                db.add(team)
                await db.flush()

                # Add all seed users to team
                for user_obj in created_users.values():
                    tm = TeamMember(
                        team_id=team.id,
                        user_id=user_obj.id,
                        role=MemberRole.OWNER if user_obj.username == "admin" else MemberRole.MEMBER
                    )
                    db.add(tm)

                # Seed Channels
                for ch_name, ch_desc in channels_list:
                    ch = Channel(
                        team_id=team.id,
                        name=ch_name,
                        description=ch_desc,
                        type=ChannelType.STANDARD,
                        created_by=created_users["admin"].id
                    )
                    db.add(ch)

        await db.commit()
        print("✅ Seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_data())
