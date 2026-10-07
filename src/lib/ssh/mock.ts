import type { SshClient, SshExecResult } from "./types";

const FIXTURES: Record<string, string> = {
  uptime: " 09:00:00 up 45 days,  3:22,  2 users,  load average: 0.52, 0.48, 0.45\n",
  "cat /proc/loadavg": "0.52 0.48 0.45 2/412 12345\n",
  nproc: "4\n",
  "free -b": `               total        used        free      shared  buff/cache   available
Mem:    16777216000  8388608000  4194304000   524288000  4194304000  7549747200
Swap:    4294967296           0  4294967296
`,
  "df -h": `Filesystem      Size  Used Avail Use% Mounted on
/dev/md0        500G  200G  280G  42% /
/dev/md1        2.0T  1.2T  700G  63% /data
`,
  "cat /proc/mdstat": `Personalities : [raid1] [raid6] [raid5] [raid4] [raid0] [raid10] [linear] 
md0 : active raid1 sda1[0] sdb1[1]
      524288 blocks super 1.2 [2/2] [UU]
`,
  "docker inspect": `/rtamvw4r4a62y8gkheeg0vi3-202201900178\x1e{"coolify.projectName":"dachpro","coolify.environmentName":"development","coolify.name":"rtamvw4r4a62y8gkheeg0vi3","coolify.type":"application","coolify.applicationId":"15","coolify.managed":"true"}\x1eCOOLIFY_FQDN=dev.dachpro.com|COOLIFY_BRANCH=development
/mwoso040kckcgck4g4wog8ow\x1e{"coolify.managed":"true","coolify.projectName":"kosmetikstudio","coolify.environmentName":"production","coolify.type":"database","coolify.database.subType":"standalone-postgresql","coolify.resourceName":"postgresql-database-mwoso040kckcgck4g4wog8ow"}\x1e
/coolify\x1e{"coolify.managed":"true","coolify.name":"coolify"}\x1e
/coolify-db\x1e{"coolify.managed":"true"}\x1e
`,
  "docker ps -a --format '{{json .}}'": [
    '{"ID":"a1","Names":"coolify","Image":"coolifyio/coolify","Status":"Up 2 weeks (healthy)","State":"running"}',
    '{"ID":"a2","Names":"coolify-realtime","Image":"coolifyio/realtime","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a3","Names":"coolify-db","Image":"postgres:16","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a4","Names":"coolify-redis","Image":"redis:7","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a5","Names":"coolify-proxy","Image":"traefik","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"b1","Names":"old-backup","Image":"alpine","Status":"Exited (0) 3 days ago","State":"exited"}',
  ].join("\n"),
  "ss -tulpn": `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
tcp   LISTEN 0      128    0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1))
tcp   LISTEN 0      128    0.0.0.0:80         0.0.0.0:*    users:(("nginx",pid=2))
tcp   LISTEN 0      128    0.0.0.0:443        0.0.0.0:*    users:(("nginx",pid=2))
`,
  "ss -tunap": `Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1))
tcp   LISTEN 0      128    0.0.0.0:80         0.0.0.0:*    users:(("nginx",pid=2))
tcp   ESTAB  0      0      10.0.0.5:443       203.0.113.10:52134 users:(("nginx",pid=2))
`,
  "ps auxww": `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 169000 12000 ?        Ss   Jun01   0:10 /sbin/init
root       412  0.1  0.2  25000  8000 ?        Ss   Jun01   1:20 sshd: /usr/sbin/sshd
www-data  1200  0.2  0.5  88000 40000 ?        S    Jun02   0:45 nginx: worker process
`,
  "docker stats --no-stream": [
    '{"Name":"coolify","CPUPerc":"2.50%","MemPerc":"12.00%"}',
    '{"Name":"coolify-db","CPUPerc":"5.00%","MemPerc":"45.00%"}',
  ].join("\n"),
  "cat /root/.ssh/authorized_keys": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey user@host\n",
  "cat '/etc/ssh/sshd_config'": "Port 22\nPermitRootLogin prohibit-password\n",
  "cat '/etc/sudoers'": "Defaults env_reset\n",
  "cat /etc/passwd": `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
deploy:x:1000:1000:Deploy User:/home/deploy:/bin/bash
`,
  "last -n": `deploy   pts/0        203.0.113.10     Wed Jun  3 08:00   still logged in
root     pts/1        198.51.100.5     Tue Jun  2 14:00 - 14:30  (00:30)
deploy   pts/2        203.0.113.10     Mon Jun  1 10:00 - 11:00  (01:00)
`,
  "grep -E 'Failed password|Accepted password|Accepted publickey' /var/log/auth.log": `Jun  3 07:00:00 sshd[999]: Failed password for invalid user admin from 203.0.113.99 port 22
Jun  3 07:01:00 sshd[1000]: Failed password for invalid user root from 203.0.113.99 port 22
Jun  3 07:02:00 sshd[1001]: Failed password for invalid user test from 198.51.100.200 port 22
Jun  3 08:00:00 sshd[1002]: Accepted publickey for deploy from 203.0.113.10 port 52100
`,
  "grep -i 'Failed password' /var/log/auth.log 2>/dev/null | tail -20": "Jun  3 07:00:00 sshd[999]: Failed password for invalid user admin from 203.0.113.99 port 22\n",
  who: `deploy   pts/0        2026-06-03 08:00 (203.0.113.10)
root     pts/1        2026-06-03 09:15 (10.0.1.20)
`,
  "w -h": `deploy   pts/0    203.0.113.10    08:00    2:15   0.05s  0.01s  -bash
root     pts/1    10.0.1.20       09:15    0.00s  0.10s  0.02s  w
`,
  "ss -tnp sport = :22": `State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
ESTAB 0      0      10.0.0.5:22         203.0.113.10:52100 users:(("sshd",pid=1200,fd=4))
ESTAB 0      0      10.0.0.5:22         10.0.1.20:44022 users:(("sshd",pid=1201,fd=4))
`,
  "fail2ban-client status sshd": `Status for the jail: sshd
|- Filter
|  |- Currently failed: 3
|  |- Total failed:     120
|  \`- File list:       /var/log/auth.log
\`- Actions
   |- Currently banned: 2
   |- Total banned:     45
   \`- Banned IP list:   203.0.113.99 198.51.100.200
`,
  "systemctl is-active fail2ban": "active\n",
  "ls -la /etc/cron.d /var/spool/cron/crontabs 2>/dev/null":
    "/etc/cron.d/e2scrub_all\n",
  "for period in daily": `periodic\tcron.daily\tapt-compat
periodic\tcron.daily\tapt
periodic\tcron.daily\tdpkg
periodic\tcron.daily\tlogrotate
periodic\tcron.daily\tman-db
periodic\tcron.daily\trkhunter
periodic\tcron.daily\tunattended-upgrades
periodic\tcron.daily\tsysstat
periodic\tcron.weekly\tman-db
periodic\tcron.weekly\trkhunter
periodic\tcron.monthly\tunattended-upgrades
file\tcron.d\te2scrub_all\t30 3 * * 6 root test -e /usr/sbin/e2scrub_all && /usr/sbin/e2scrub_all
file\tcrontab\tmain\tSHELL=/bin/sh PATH=... run-parts /etc/cron.hourly ...
`,
  "crontab -l 2>/dev/null": "",
  "for u in docker fail2ban ssh sshd": `unit\tdocker\tactive
unit\tfail2ban\tactive
unit\tssh\tactive
unit\tsshd\tinactive
`,
  "systemctl list-units --type=service --state=failed": "",
  "which nmap": "",
  "which masscan": "",
  "which zmap": "",
  "which rustscan": "",
  "journalctl -p err": "",
  "dmesg 2>/dev/null | tail -80": "",
  sensors: "Core 0:        +42.0°C\n",
};

function matchFixture(command: string): string {
  if (
    command.includes("docker logs") &&
    command.includes("--since") &&
    (command.includes("coolify-proxy") || command.includes("PROXY="))
  ) {
    return [
      "PROXY:coolify-proxy",
      JSON.stringify({
        ClientHost: "203.0.113.50",
        RequestMethod: "GET",
        RequestPath: "/shop/masks",
        RequestHost: "shop.example.com",
        DownstreamStatus: 200,
        RequestUserAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        StartUTC: "2026-06-03T08:01:00Z",
      }),
      JSON.stringify({
        ClientHost: "198.51.100.10",
        RequestMethod: "GET",
        RequestPath: "/robots.txt",
        RequestHost: "shop.example.com",
        DownstreamStatus: 200,
        RequestUserAgent: "Mozilla/5.0 (compatible; bingbot/2.0)",
        StartUTC: "2026-06-03T08:02:00Z",
      }),
      JSON.stringify({
        ClientHost: "203.0.113.50",
        RequestMethod: "GET",
        RequestPath: "/cart",
        RequestHost: "shop.example.com",
        DownstreamStatus: 200,
        RequestUserAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        StartUTC: "2026-06-03T08:03:00Z",
      }),
      JSON.stringify({
        ClientHost: "192.0.2.80",
        RequestMethod: "GET",
        RequestPath: "/",
        RequestHost: "shop.example.com",
        DownstreamStatus: 404,
        RequestUserAgent: "SemrushBot/7~bl",
        StartUTC: "2026-06-03T08:04:00Z",
      }),
      '203.0.113.77 - - [03/Jun/2026:08:05:00 +0000] "GET /profil HTTP/1.1" 200 1200 "-" "Mozilla/5.0 (X11; Linux x86_64) Firefox/125.0"',
    ].join("\n");
  }
  if (command.includes("sshd -T") && command.includes("permitrootlogin")) {
    return "permitrootlogin prohibit-password\n";
  }
  if (
    command.includes("/root/.ssh/authorized_keys") &&
    command.includes("/home/*/.ssh")
  ) {
    return [
      "root\tssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey user@host",
      "deploy\tssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDeployKey deploy@host",
    ].join("\n");
  }
  if (command.includes("docker inspect") && command.includes("--format")) {
    if (command.includes("{{.Config.Image}}")) {
      const m = command.match(/'([^']+)'/);
      const name = m?.[1] ?? "coolify";
      if (name === "coolify") return "coolifyio/coolify:latest\n";
      if (name.includes("wordpress")) return "wordpress:latest\n";
      return `rtamvw4r4a62y8gkheeg0vi3:7658e627650b47595b0424631971\n`;
    }
    if (command.includes("{{.Image}}")) {
      return "sha256:abc123mockdigest0000000000000000000000000000000000\n";
    }
    return FIXTURES["docker inspect"] ?? "";
  }
  if (command.includes("command -v trivy")) {
    return "/usr/bin/trivy\n";
  }
  if (command.includes("trivy image")) {
    return JSON.stringify({
      Results: [
        {
          Target: "mock",
          Vulnerabilities: [],
        },
      ],
    });
  }
  for (const [key, value] of Object.entries(FIXTURES)) {
    if (command.includes(key) || command === key) return value;
  }
  if (command.includes("/backups/daily") && command.includes("-maxdepth 1")) {
    const now = Math.floor(Date.now() / 1000) - 7200;
    const today = new Date().toISOString().slice(0, 10);
    return `${now} /backups/daily/${today}\n`;
  }
  if (command.includes("du -sb") && command.includes("/backups/daily/")) {
    return "5368709120\n";
  }
  if (command.includes("/backups/monthly")) {
    const now = Math.floor(Date.now() / 1000) - 86400;
    return `${now} 2147483648 /backups/monthly/full-backup-2026-06.tar.gz\n`;
  }
  if (command.includes("kawai-complete-backup") || command.includes("*.tar.gz")) {
    const now = Math.floor(Date.now() / 1000) - 3600;
    return `/root/kawai-complete-backup.tar.gz\n${now} 12884901888 /root/kawai-complete-backup.tar.gz\n`;
  }
  if (command.includes("ls -1d") && command.includes("*.tar.gz")) {
    return "/root/kawai-complete-backup.tar.gz\n";
  }
  if (command.includes("/data/coolify/backups")) {
    const now = Math.floor(Date.now() / 1000) - 7200;
    return `${now} 524288000 /data/coolify/backups/db/app-2026-06-03.sql.gz\n${now - 86400} 520000000 /data/coolify/backups/db/app-2026-06-02.sql.gz\n`;
  }
  if (command.startsWith("find ") || command.includes("stat -c")) {
    const now = Math.floor(Date.now() / 1000) - 3600;
    if (command.includes("/data/coolify/backups")) {
      return `${now} 524288000 /data/coolify/backups/db/app-2026-06-03.sql.gz\n`;
    }
    if (command.includes("/root/")) {
      return `${now} 12884901888 /root/kawai-complete-backup.tar.gz\n`;
    }
    return "";
  }
  if (command.includes("psql") || command.includes("mysql")) {
    return " db_size | 104857600\n(1 row)\n";
  }
  if (command.includes("dpkg -l")) return "";
  return "";
}

export class MockSshClient implements SshClient {
  async exec(command: string): Promise<SshExecResult> {
    await new Promise((r) => setTimeout(r, 10));
    const stdout = matchFixture(command);
    return { stdout, stderr: "", code: stdout ? 0 : 0 };
  }
}
