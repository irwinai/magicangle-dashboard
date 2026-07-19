import unittest

from app.decoder import decode_order


class DecoderTests(unittest.TestCase):
    def test_total_goal_code_is_decoded_for_every_compact_segment(self):
        order = {
            "id": "P20260716000001028295",
            "playType": "502",
            "betCodeForResult": "502@20260717|5|206|23^20260717|5|205|23^",
            "selfBuyAmt": 5000000,
            "unitAmt": 800,
            "jingcaiResultList": [
                {"teamId": "205", "team": "甲:乙", "peilvs": []},
                {"teamId": "206", "team": "丙:丁", "peilvs": []},
            ],
        }

        decoded = decode_order(order)

        self.assertEqual([market["label"] for market in decoded["matches"][0]["markets"]], ["2球", "3球"])
        self.assertEqual([market["label"] for market in decoded["matches"][1]["markets"]], ["2球", "3球"])
        self.assertEqual(decoded["stake"]["self_buy_yuan"], 50000.0)
        self.assertEqual(decoded["stake"]["unit_yuan"], 8.0)

    def test_mixed_codes_are_human_readable(self):
        order = {
            "id": "P20260712000001021170",
            "playType": "500",
            "betCode": "500@20260714|2|101|J00004|11^20260714|2|101|J00003|4^",
            "jingcaiResultList": [{"teamId": "101", "team": "甲:乙", "peilvs": [{"peilv": "5.00"}, {"peilv": "4.40"}]}],
        }

        decoded = decode_order(order)

        self.assertEqual([market["label"] for market in decoded["matches"][0]["markets"]], ["1:1", "平_平"])


if __name__ == "__main__":
    unittest.main()
