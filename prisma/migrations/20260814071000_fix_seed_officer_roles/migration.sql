UPDATE "User" SET "role" = 'CLASS_MONITOR' WHERE "email" = 'loptruong@chunhiemso.local' AND "role" = 'TEAM_LEADER';
UPDATE "User" SET "role" = 'TEAM_LEADER' WHERE "email" = 'totruong@chunhiemso.local' AND "role" = 'CLASS_MONITOR';
UPDATE "ClassOfficerAppointment" SET "role" = 'CLASS_MONITOR', "teamId" = NULL WHERE "userId" = (SELECT "id" FROM "User" WHERE "email" = 'loptruong@chunhiemso.local');
UPDATE "ClassOfficerAppointment" SET "role" = 'TEAM_LEADER' WHERE "userId" = (SELECT "id" FROM "User" WHERE "email" = 'totruong@chunhiemso.local');