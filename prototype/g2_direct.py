"""
CounselView — Direct BLE connection to Even Realities G2

The G2 uses the same Nordic UART Service (NUS) as G1 but with
dual BLE connections (left + right temple). Each temple is a
separate BLE peripheral.

This script scans for G2 devices and attempts to push text
to the display. If the G2 is already paired to your phone,
you may need to disconnect from the Even app first.

Requirements:
    pip install bleak

Usage:
    python g2_direct.py              # scan and connect
    python g2_direct.py --scan-only  # just scan for devices
"""

import asyncio
import sys
import struct
from bleak import BleakScanner, BleakClient

# Nordic UART Service UUIDs (same as G1)
NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # Write to this
NUS_RX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # Notifications from this

# G2 display: 576x288, 4-bit greyscale
# Text command: 0x4E
TEXT_CMD = 0x4E


def build_text_packet(text: str, screen_id: int = 0, total_screens: int = 1) -> bytes:
    """Build a text display packet for the G2.

    Protocol (from EvenDemoApp reverse engineering):
    [0x4E] [screen_id:2] [total_screens:2] [new_char_pos0:2] [new_char_pos1:2]
    [page_flag:1] [text_bytes...]
    """
    text_bytes = text.encode("utf-8")

    # Header
    header = bytes([TEXT_CMD])
    header += struct.pack(">H", screen_id)        # current screen index
    header += struct.pack(">H", total_screens)     # total screens
    header += struct.pack(">H", 0)                 # new char position 0
    header += struct.pack(">H", len(text_bytes))   # new char position 1
    header += bytes([0x01])                        # page flag: NEW_CONTENT

    return header + text_bytes


async def scan_for_g2():
    """Scan for Even Realities G2 devices."""
    print("Scanning for G2 glasses (10 seconds)...\n")

    devices = await BleakScanner.discover(timeout=10, return_adv=True)

    g2_devices = []
    for device, adv_data in devices.values():
        name = device.name or adv_data.local_name or ""
        # G2 devices typically advertise as "Even G2" or similar
        if "even" in name.lower() or "g2" in name.lower():
            g2_devices.append((device, adv_data))
            print(f"  Found: {name} [{device.address}] RSSI={adv_data.rssi}")

        # Also check for NUS service
        if NUS_SERVICE_UUID.lower() in [str(s).lower() for s in (adv_data.service_uuids or [])]:
            if (device, adv_data) not in g2_devices:
                g2_devices.append((device, adv_data))
                print(f"  Found (NUS): {name or 'Unknown'} [{device.address}] RSSI={adv_data.rssi}")

    if not g2_devices:
        print("  No G2 devices found.")
        print("\n  Troubleshooting:")
        print("  1. Make sure glasses are out of the case and awake (double-tap temple)")
        print("  2. Disconnect from the Even Realities app first (G2 only pairs to one device)")
        print("  3. Restart glasses: tap each temple 5 times rapidly")
        print("  4. Make sure Bluetooth is enabled on this machine")

    return g2_devices


async def connect_and_send(device, text: str):
    """Connect to a G2 device and send text to the display."""
    print(f"\nConnecting to {device.name or device.address}...")

    def notification_handler(sender, data):
        print(f"  ← Received: {data.hex()} ({len(data)} bytes)")

    async with BleakClient(device) as client:
        if not client.is_connected:
            print("  Connection failed.")
            return

        print(f"  Connected! MTU={client.mtu_size}")

        # List services
        print("\n  Services:")
        for service in client.services:
            print(f"    {service.uuid}: {service.description}")
            for char in service.characteristics:
                props = ", ".join(char.properties)
                print(f"      {char.uuid}: {props}")

        # Subscribe to RX notifications
        try:
            await client.start_notify(NUS_RX_UUID, notification_handler)
            print(f"\n  Subscribed to RX notifications")
        except Exception as e:
            print(f"\n  Could not subscribe to RX: {e}")

        # Send text
        packet = build_text_packet(text)
        print(f"\n  Sending text: '{text[:50]}...' ({len(packet)} bytes)")
        print(f"  Packet: {packet.hex()}")

        try:
            await client.write_gatt_char(NUS_TX_UUID, packet, response=True)
            print("  Sent successfully!")
        except Exception as e:
            print(f"  Send failed: {e}")
            # Try without response
            try:
                await client.write_gatt_char(NUS_TX_UUID, packet, response=False)
                print("  Sent (no response) — check glasses display")
            except Exception as e2:
                print(f"  Send failed again: {e2}")

        # Wait a moment for any responses
        await asyncio.sleep(3)
        print("\n  Done. Check your glasses!")


async def interactive_mode(device):
    """Interactive text-sending session."""
    print(f"\nConnecting to {device.name or device.address}...")

    def notification_handler(sender, data):
        print(f"  ← RX: {data.hex()}")

    async with BleakClient(device) as client:
        if not client.is_connected:
            print("Connection failed.")
            return

        print(f"Connected! Type text to send, 'q' to quit.\n")

        try:
            await client.start_notify(NUS_RX_UUID, notification_handler)
        except Exception:
            pass

        while True:
            text = input("glasses> ").strip()
            if text.lower() == "q":
                break
            if not text:
                continue

            packet = build_text_packet(text)
            try:
                await client.write_gatt_char(NUS_TX_UUID, packet, response=False)
                print(f"  → Sent ({len(packet)} bytes)")
            except Exception as e:
                print(f"  → Error: {e}")


async def main():
    scan_only = "--scan-only" in sys.argv

    devices = await scan_for_g2()

    if scan_only or not devices:
        return

    # Use first device found
    device = devices[0][0]

    if "--interactive" in sys.argv:
        await interactive_mode(device)
    else:
        # Send a test message
        await connect_and_send(
            device,
            "CounselView\n"
            "Connected via BLE\n"
            "\n"
            "Ready for commands."
        )


if __name__ == "__main__":
    asyncio.run(main())
