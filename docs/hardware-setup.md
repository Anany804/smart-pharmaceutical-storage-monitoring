# Hardware and Wokwi setup

## Pin map and wiring

| Component | Connection |
|---|---|
| ESP32 DevKit V1 3V3 | DHT22 VCC; LDR module VCC; DHT pull-up resistor end 1 |
| ESP32 GND | DHT22 GND; LDR module GND; pushbutton contact 2; common ground |
| ESP32 GPIO15 | DHT22 SDA/data; pull-up resistor end 2 |
| ESP32 GPIO34 (input-only ADC) | LDR module AO |
| ESP32 GPIO18 | Pushbutton contact 1, configured `INPUT_PULLUP` |

Install an external 4.7–10 kΩ pull-up between DHT22 data and 3.3 V unless the exact sensor breakout already includes one. The Wokwi diagram includes a 10 kΩ pull-up explicitly. Wokwi's photoresistor sensor part includes an LDR with a 10 kΩ divider; it is powered at 3.3 V, so the analog output does not exceed the ESP32 input voltage. For a bare LDR, build an external divider and ensure GPIO34 never sees more than 3.3 V. ESP32 GPIO34 is input-only.

`wokwi/diagram.json` uses the documented Wokwi part IDs and the named pins above. It provides a DHT22 slider, adjustable `lux` input and a keyboard `I` button shortcut. Wiring is also documented inline in the diagram and firmware pin constants.

Wokwi compatibility references: [diagram format and supported ESP32 part IDs](https://docs.wokwi.com/diagram-format), [DHT22](https://docs.wokwi.com/parts/wokwi-dht22), [photoresistor module](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor), [pushbutton contacts](https://docs.wokwi.com/parts/wokwi-pushbutton), and [ESP32 Wi-Fi/private gateway networking](https://docs.wokwi.com/guides/esp32-wifi).

## Firmware build and physical device

Install PlatformIO, then:

```sh
cd firmware
cp include/config.example.h include/config.h
pio run
```

Set Wi-Fi credentials and an API URL reachable from the physical device. If running Node-RED on another local computer, use its LAN address (for example `http://192.168.1.20:1880`), open the host firewall only to the trusted LAN, and set `NODE_RED_HOST=0.0.0.0`. Before binding beyond loopback, configure `NODE_RED_ADMIN_HASH` or disable the editor with `NODE_RED_DISABLE_EDITOR=true`. Also protect API reads/inspection routes with a LAN firewall or authenticated reverse proxy. If `PHARMA_INGEST_TOKEN` is configured, set the same `API_BEARER_TOKEN` in firmware.

## Wokwi simulation and local networking

The project targets an ESP32 DevKit V1 Wokwi part and PlatformIO `esp32dev`. Build the firmware first, then open the `wokwi/` folder/config in Wokwi for VS Code. The `wokwi.toml` points to PlatformIO's `.pio/build/esp32dev/firmware.bin` and `.elf` outputs.

For the simulated ESP32 to connect to a service on your computer, use Wokwi's **private IoT Gateway** and `http://host.wokwi.internal:1880`. The public gateway has outbound internet access but cannot reach services on your computer. Local gateway support uses the Wokwi VS Code workflow; availability and browser support depend on the Wokwi plan/tooling. Wokwi local networking was not available to validate in this run.

## Secure remote ingest option

Avoid publishing port 1880 or the Node-RED editor. A safer remote pattern is:

1. Keep Node-RED bound to loopback on the host and configure its editor authentication or disable the editor.
2. Use a managed HTTPS tunnel/reverse proxy and expose only `POST /api/sensor-data` to the ESP32 hostname; keep dashboard and other API routes private or behind user authentication.
3. Set a long random `PHARMA_INGEST_TOKEN` in the Node-RED process. Set the same token in firmware's `API_BEARER_TOKEN`; the server compares it in constant time.
4. Configure the server's public CA certificate as `API_TLS_ROOT_CA` in the untracked firmware config. HTTPS without a configured trusted CA is rejected by firmware.
5. Verify DNS, ingress path restrictions, token rotation, TLS validation and firewall rules before using any live device.

This project does not create or configure a tunnel account, public DNS hostname, firewall rule or hardware credentials. Those remain deployment-specific external setup.
