# Production checklist

- [ ] PostgreSQL migration sạch và dữ liệu được đối soát.
- [ ] Secret riêng cho staging/production; không dùng tài khoản mẫu.
- [ ] HTTPS, reverse proxy, Redis rate limit, object storage private.
- [ ] Email production, DNS SPF/DKIM/DMARC.
- [ ] Backup tự động và restore drill thành công.
- [ ] Monitoring, cảnh báo, log có redaction.
- [ ] Audit bảo mật không còn Critical/High.
- [ ] E2E thương mại và multi-tenant đạt.
- [ ] Chính sách pháp lý được phê duyệt.